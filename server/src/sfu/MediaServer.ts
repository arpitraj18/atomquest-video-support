import type { MediaStreamTrack, RTCIceCandidate } from 'werift';
import { Peer, type TrackKind } from './Peer';
import { Room } from './Room';
import { logger } from '../logger';
import type { Role } from '../types';

interface CreatePeerInput {
  sessionId: string;
  participantId: string;
  role: Role;
  displayName: string;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionState: (state: string) => void;
}

/**
 * Owns every active media room. The signaling layer drives it: create a peer when a
 * participant joins, relay SDP and ICE, and remove the peer when they leave. The
 * recording layer reads a room's live tracks through getSessionTracks().
 */
export class MediaServer {
  private readonly rooms = new Map<string, Room>();

  private room(sessionId: string): Room {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new Room(sessionId);
      this.rooms.set(sessionId, room);
    }
    return room;
  }

  createPeer(input: CreatePeerInput): Peer {
    const room = this.room(input.sessionId);
    const peer = new Peer(input.participantId, input.role, input.displayName, {
      onIceCandidate: input.onIceCandidate,
      onConnectionState: input.onConnectionState,
      onProducer: (kind: TrackKind, track: MediaStreamTrack) => {
        room.onProducer(input.participantId, kind, track);
      },
    });
    room.addPeer(peer);
    room.wireExistingProducersTo(input.participantId);
    return peer;
  }

  async handleOffer(sessionId: string, participantId: string, sdp: string): Promise<{ sdp: string; type: string } | null> {
    const peer = this.rooms.get(sessionId)?.getPeer(participantId);
    if (!peer) return null;
    return peer.handleOffer(sdp, 'offer');
  }

  async addIceCandidate(sessionId: string, participantId: string, candidate: RTCIceCandidate): Promise<void> {
    const peer = this.rooms.get(sessionId)?.getPeer(participantId);
    if (peer) await peer.addIceCandidate(candidate);
  }

  async removePeer(sessionId: string, participantId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    await room.removePeer(participantId);
    if (room.size === 0) {
      this.rooms.delete(sessionId);
      logger.debug({ sessionId }, 'room emptied and disposed');
    }
  }

  async closeRoom(sessionId: string): Promise<void> {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    await room.close();
    this.rooms.delete(sessionId);
  }

  /**
   * The live producer tracks for a session (each participant's mic and cam), used by the
   * recorder. Returns whatever is currently published — typically up to four tracks.
   */
  getSessionTracks(sessionId: string): MediaStreamTrack[] {
    const room = this.rooms.get(sessionId);
    if (!room) return [];
    const tracks: MediaStreamTrack[] = [];
    for (const peer of room.listPeers()) {
      if (peer.audioProducer) tracks.push(peer.audioProducer);
      if (peer.videoProducer) tracks.push(peer.videoProducer);
    }
    return tracks;
  }

  /** Request an immediate keyframe from all participants in a room. Useful when starting a recording. */
  requestKeyframes(sessionId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    for (const peer of room.listPeers()) {
      peer.requestKeyframe();
    }
  }

  /* ─── metrics helpers ─── */

  get roomCount(): number {
    return this.rooms.size;
  }

  get peerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }
}

/** Single shared instance for the process. */
export const mediaServer = new MediaServer();
