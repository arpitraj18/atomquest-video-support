import type { MediaStreamTrack } from 'werift';
import { Peer, type TrackKind } from './Peer';
import { logger } from '../logger';

/**
 * The media forwarding graph for a single session. A support call is 1:1, so a room holds
 * at most two peers and the graph is just "each peer's producers feed the other peer's
 * output tracks". Keeping this as its own object means the routing logic is isolated from
 * connection setup (Peer) and from signaling.
 *
 * (The same structure generalises to N participants by forwarding each producer to every
 * other peer's per-sender output track; that is noted as future work in the README.)
 */
export class Room {
  private readonly peers = new Map<string, Peer>();
  /** Active forwarding subscriptions, so they can be torn down on leave. key: src>dst:kind */
  private readonly pipes = new Map<string, () => void>();

  constructor(readonly sessionId: string) {}

  get size(): number {
    return this.peers.size;
  }

  listPeers(): Peer[] {
    return [...this.peers.values()];
  }

  getPeer(participantId: string): Peer | undefined {
    return this.peers.get(participantId);
  }

  addPeer(peer: Peer): void {
    this.peers.set(peer.participantId, peer);
    logger.debug({ sessionId: this.sessionId, participantId: peer.participantId }, 'peer added to room');
  }

  /**
   * Wire a producer (a participant's mic/cam that just arrived) to every other peer in the
   * room. Idempotent per (source, destination, kind).
   */
  onProducer(sourceId: string, kind: TrackKind, track: MediaStreamTrack): void {
    const source = this.peers.get(sourceId);
    if (!source) return;
    for (const dest of this.peers.values()) {
      if (dest.participantId === sourceId) continue;
      this.connect(source, dest, kind, track);
    }
  }

  /**
   * When a new peer joins, pull any producers the existing peer has already published so the
   * newcomer starts receiving immediately rather than waiting for the next packet event.
   */
  wireExistingProducersTo(newPeerId: string): void {
    const newPeer = this.peers.get(newPeerId);
    if (!newPeer) return;
    for (const other of this.peers.values()) {
      if (other.participantId === newPeerId) continue;
      if (other.audioProducer) this.connect(other, newPeer, 'audio', other.audioProducer);
      if (other.videoProducer) this.connect(other, newPeer, 'video', other.videoProducer);
      // And forward the newcomer's already-known producers back to the other peer.
      if (newPeer.audioProducer) this.connect(newPeer, other, 'audio', newPeer.audioProducer);
      if (newPeer.videoProducer) this.connect(newPeer, other, 'video', newPeer.videoProducer);
    }
  }

  private connect(source: Peer, dest: Peer, kind: TrackKind, track: MediaStreamTrack): void {
    const key = `${source.participantId}>${dest.participantId}:${kind}`;
    if (this.pipes.has(key)) return; // already forwarding

    const outTrack = kind === 'audio' ? dest.outAudio : dest.outVideo;
    const { unSubscribe } = track.onReceiveRtp.subscribe((rtp) => {
      try {
        outTrack.writeRtp(rtp);
      } catch {
        // transport not ready yet; the next packet will land once it is
      }
    });
    this.pipes.set(key, unSubscribe);
    logger.debug({ key }, 'forwarding established');

    // Nudge the source for a keyframe so the destination renders video without delay.
    if (kind === 'video') {
      source.requestKeyframe();
      setTimeout(() => source.requestKeyframe(), 250);
      setTimeout(() => source.requestKeyframe(), 1000);
    }
  }

  /** Remove a peer, tearing down its connection and any forwarding it was part of. */
  async removePeer(participantId: string): Promise<void> {
    const peer = this.peers.get(participantId);
    if (!peer) return;

    for (const [key, dispose] of this.pipes) {
      if (key.startsWith(`${participantId}>`) || key.includes(`>${participantId}:`)) {
        dispose();
        this.pipes.delete(key);
      }
    }
    await peer.close();
    this.peers.delete(participantId);
    logger.debug({ sessionId: this.sessionId, participantId }, 'peer removed from room');
  }

  async close(): Promise<void> {
    for (const dispose of this.pipes.values()) dispose();
    this.pipes.clear();
    await Promise.all([...this.peers.values()].map((p) => p.close()));
    this.peers.clear();
  }
}
