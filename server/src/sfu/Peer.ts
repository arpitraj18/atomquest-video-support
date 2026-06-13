import { MediaStreamTrack, RTCPeerConnection, type RTCIceCandidate } from 'werift';
import { mediaCodecs, headerExtensions } from './codecs';
import { env } from '../env';
import { logger } from '../logger';
import type { Role } from '../types';

export type TrackKind = 'audio' | 'video';

interface PeerCallbacks {
  /** Fired for each locally-gathered ICE candidate; relay it to the browser. */
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  /** Fired when the underlying transport state changes. */
  onConnectionState: (state: string) => void;
  /** Fired when one of this participant's own tracks (mic/cam) arrives at the SFU. */
  onProducer: (kind: TrackKind, track: MediaStreamTrack) => void;
}

/**
 * One server-side WebRTC endpoint for one participant.
 *
 * Each peer has:
 *   - two *producer* tracks: the participant's own mic and cam, received from the browser;
 *   - two *output* tracks: the slots into which the SFU writes the OTHER participant's RTP,
 *     so it flows back down to this browser.
 *
 * The browser is always the offerer (a normal sendrecv call). On receiving its offer we
 * attach our output tracks to the matching transceivers and answer sendrecv, so no
 * renegotiation is ever needed when the second participant joins.
 */
export class Peer {
  readonly pc: RTCPeerConnection;
  readonly outAudio = new MediaStreamTrack({ kind: 'audio' });
  readonly outVideo = new MediaStreamTrack({ kind: 'video' });

  audioProducer?: MediaStreamTrack;
  videoProducer?: MediaStreamTrack;

  private videoTransceiverReady = false;

  constructor(
    readonly participantId: string,
    readonly role: Role,
    readonly displayName: string,
    private readonly cb: PeerCallbacks,
  ) {
    this.pc = new RTCPeerConnection({
      codecs: mediaCodecs,
      headerExtensions,
      iceServers: env.STUN_URL ? [{ urls: env.STUN_URL }] : [],
      iceAdditionalHostAddresses: env.ANNOUNCED_IP ? [env.ANNOUNCED_IP] : undefined,
      bundlePolicy: 'max-bundle',
    });

    this.pc.onIceCandidate.subscribe((candidate) => {
      if (candidate) this.cb.onIceCandidate(candidate);
    });

    this.pc.connectionStateChange.subscribe((state) => {
      this.cb.onConnectionState(state);
    });

    // The browser's mic/cam land here.
    this.pc.onTrack.subscribe((track) => {
      if (track.kind === 'audio') this.audioProducer = track;
      else this.videoProducer = track;
      this.cb.onProducer(track.kind as TrackKind, track);
    });
  }

  /**
   * Process the browser's SDP offer and return our answer. We attach the output tracks
   * to the freshly-created transceivers and force their direction to sendrecv so the
   * answer advertises that the SFU will also send the remote participant's media.
   */
  async handleOffer(sdp: string, type: 'offer'): Promise<{ sdp: string; type: string }> {
    await this.pc.setRemoteDescription({ sdp, type });

    for (const transceiver of this.pc.getTransceivers()) {
      const out = transceiver.kind === 'audio' ? this.outAudio : this.outVideo;
      // eslint-disable-next-line no-await-in-loop
      await transceiver.sender.replaceTrack(out);
      transceiver.setDirection('sendrecv');
      if (transceiver.kind === 'video') this.videoTransceiverReady = true;
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    const local = this.pc.localDescription;
    if (!local) throw new Error('failed to produce a local SDP answer');
    return { sdp: local.sdp, type: local.type };
  }

  async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      logger.debug({ err, participantId: this.participantId }, 'failed to add ICE candidate');
    }
  }

  /**
   * Ask this participant's browser to emit a fresh video keyframe. Called when the other
   * participant has just subscribed, so their first frame is decodable immediately rather
   * than after the next natural keyframe interval.
   */
  requestKeyframe(): void {
    if (!this.videoProducer) return;
    const videoTransceiver = this.pc.getTransceivers().find((t) => t.kind === 'video');
    const ssrc = videoTransceiver?.receiver.tracks?.[0]?.ssrc;
    if (videoTransceiver && ssrc) {
      videoTransceiver.receiver.sendRtcpPLI(ssrc).catch(() => undefined);
    }
  }

  get hasVideoChannel(): boolean {
    return this.videoTransceiverReady;
  }

  async close(): Promise<void> {
    try {
      await this.pc.close();
    } catch {
      // already closing
    }
  }
}
