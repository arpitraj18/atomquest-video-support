/**
 * Browser-side WebRTC — mirrors the validated SFU model exactly.
 *
 * KEY INVARIANTS (do not change without re-testing against the server):
 *  1. Browser is always the OFFERER.
 *  2. One sendrecv transceiver per kind (audio + video) — never two of the same kind.
 *  3. createOffer → emit sdp:offer → server answers sdp:answer → setRemoteDescription.
 *  4. Trickle ICE both ways.
 *  5. Remote tracks arrive via ontrack (the other participant's media forwarded by the SFU).
 *  6. No renegotiation ever needed for 1:1.
 */

import type { Socket } from './socket';
import { ClientEvents, ServerEvents, type SdpAnswerPayload } from './socket';

export interface RtcHandle {
  /** The peer connection. */
  pc: RTCPeerConnection;
  /** The local MediaStream (mic + cam). */
  localStream: MediaStream;
  /** The remote MediaStream (from the other participant, forwarded by the SFU). */
  remoteStream: MediaStream;
  /** Toggle local audio (mute/unmute). Returns new state. */
  toggleAudio(): boolean;
  /** Toggle local video (camera on/off). Returns new state. */
  toggleVideo(): boolean;
  /** Toggle screen sharing. Returns true if screen is being shared, false otherwise. */
  toggleScreenShare(): Promise<boolean>;
  /** Switch between front/back cameras if available. */
  flipCamera(): Promise<void>;
  /** Whether local audio is currently enabled. */
  audioEnabled: boolean;
  /** Whether local video is currently enabled. */
  videoEnabled: boolean;
  /** Whether screen sharing is currently active. */
  isScreenSharing: boolean;
  /** Tear down the connection and release all resources. */
  close(): void;
}

export interface RtcOptions {
  socket: Socket;
  onRemoteTrack?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onError?: (err: Error) => void;
}

/**
 * Acquire media, build the RTCPeerConnection, create an offer, and wire up
 * the full signaling path through the socket. Returns a handle for the UI
 * to control mute/camera/close.
 */
export async function createRtcConnection(options: RtcOptions): Promise<RtcHandle> {
  const { socket, onRemoteTrack, onConnectionState, onError } = options;

  /* 1. Get local media — progressive fallback for same-machine testing */
  let localStream: MediaStream;
  try {
    // Try full audio + video first
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  } catch {
    // Camera might be busy (another tab). Try audio-only.
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      onError?.(new Error('Camera is in use by another app. Joining with audio only.'));
    } catch {
      // Audio also busy? Try video-only.
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        onError?.(new Error('Microphone is in use by another app. Joining with video only.'));
      } catch (finalErr) {
        // Nothing available at all
        throw new Error(
          finalErr instanceof DOMException && finalErr.name === 'NotAllowedError'
            ? 'Camera and microphone access was denied. Please allow access in your browser settings and try again.'
            : 'Could not access your camera or microphone. Make sure they are connected and not in use by another app.',
        );
      }
    }
  }

  /* 2. Create RTCPeerConnection with STUN */
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    bundlePolicy: 'max-bundle',
  });

  const remoteStream = new MediaStream();

  let audioEnabled = true;
  let videoEnabled = true;
  let isScreenSharing = false;
  let screenStream: MediaStream | null = null;
  let currentFacingMode: 'user' | 'environment' = 'user';

  /* 3. Add ONE sendrecv transceiver per kind with local tracks.
   * We MUST always add both audio and video transceivers — the SFU expects
   * exactly one m-line per kind. If a local track is missing (camera/mic busy),
   * we still add a recvonly transceiver so we receive the remote stream. */
  const audioTrack = localStream.getAudioTracks()[0];
  const videoTrack = localStream.getVideoTracks()[0];

  if (audioTrack) {
    pc.addTransceiver(audioTrack, { direction: 'sendrecv' });
  } else {
    pc.addTransceiver('audio', { direction: 'recvonly' });
    audioEnabled = false;
  }
  if (videoTrack) {
    pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
  } else {
    pc.addTransceiver('video', { direction: 'recvonly' });
    videoEnabled = false;
  }

  /* 4. Remote tracks from the SFU → remote stream for the UI */
  pc.ontrack = (event) => {
    remoteStream.addTrack(event.track);
    onRemoteTrack?.(remoteStream);
  };

  /* 5. Connection state reporting */
  pc.onconnectionstatechange = () => {
    onConnectionState?.(pc.connectionState);
  };

  /* 6. Trickle ICE: local candidates → server */
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit(ClientEvents.IceCandidate, { candidate: event.candidate.toJSON() });
    }
  };

  /* 7. Listen for server's answer and remote ICE candidates */
  const onSdpAnswer = async (payload: SdpAnswerPayload) => {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({
        sdp: payload.sdp,
        type: payload.type as RTCSdpType,
      }));
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error('Failed to set remote description'));
    }
  };

  const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit }) => {
    try {
      if (payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch {
      // Non-fatal: some candidates arrive after connection is established
    }
  };

  socket.on(ServerEvents.SdpAnswer, onSdpAnswer);
  socket.on(ServerEvents.IceCandidate, onIceCandidate);

  /* 8. Create offer and send to the SFU */
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit(ClientEvents.SdpOffer, { sdp: offer.sdp });
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error('Failed to create WebRTC offer'));
  }

  /* ── Controls ── */

  function toggleAudio(): boolean {
    const track = localStream.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      audioEnabled = track.enabled;
      socket.emit(ClientEvents.MediaState, { audioEnabled, videoEnabled });
    }
    return audioEnabled;
  }

  function toggleVideo(): boolean {
    const track = localStream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      videoEnabled = track.enabled;
      socket.emit(ClientEvents.MediaState, { audioEnabled, videoEnabled });
    }
    return videoEnabled;
  }

  async function toggleScreenShare(): Promise<boolean> {
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!videoSender) return false;

    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
        screenStream = null;
      }
      const cameraTrack = localStream.getVideoTracks()[0];
      if (cameraTrack) {
        await videoSender.replaceTrack(cameraTrack);
      }
      isScreenSharing = false;
    } else {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) {
          await videoSender.replaceTrack(screenTrack);
          isScreenSharing = true;

          // Revert automatically if browser's native "Stop Sharing" button is clicked
          screenTrack.onended = () => {
            if (isScreenSharing) {
              toggleScreenShare().catch(console.error);
            }
          };
        }
      } catch (err) {
        // User canceled screen share prompt
        isScreenSharing = false;
      }
    }
    return isScreenSharing;
  }

  async function flipCamera(): Promise<void> {
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!videoSender) return;

    const nextMode = currentFacingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextMode } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (newTrack) {
        await videoSender.replaceTrack(newTrack);
        localStream.getVideoTracks().forEach((t) => {
          localStream.removeTrack(t);
          t.stop();
        });
        localStream.addTrack(newTrack);
        currentFacingMode = nextMode;
        if (!videoEnabled) {
          newTrack.enabled = false;
        }
      }
    } catch (err) {
      console.warn('Could not flip camera', err);
      onError?.(new Error('Could not switch camera. Device might not have another lens.'));
    }
  }

  function close(): void {
    socket.off(ServerEvents.SdpAnswer, onSdpAnswer);
    socket.off(ServerEvents.IceCandidate, onIceCandidate);

    localStream.getTracks().forEach((t) => t.stop());
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }
    pc.close();
  }

  return {
    pc,
    localStream,
    remoteStream,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    flipCamera,
    get audioEnabled() { return audioEnabled; },
    get videoEnabled() { return videoEnabled; },
    get isScreenSharing() { return isScreenSharing; },
    close,
  };
}
