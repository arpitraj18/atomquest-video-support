import {
  RTCRtpCodecParameters,
  RTCRtpHeaderExtensionParameters,
  useSdesMid,
  useAbsSendTime,
  useTransportWideCC,
} from 'werift';

/**
 * Media is restricted to VP8 + Opus on purpose:
 *   - both are royalty-free and supported by every evergreen browser, and
 *   - both mux cleanly into WebM, which is what the server-side recorder writes.
 *
 * Pinning the codec set also keeps SDP negotiation deterministic, which matters for
 * an SFU that has to forward one peer's RTP straight into another peer's sender.
 */
export const mediaCodecs = {
  audio: [
    new RTCRtpCodecParameters({
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
      payloadType: 111,
    }),
  ],
  video: [
    new RTCRtpCodecParameters({
      mimeType: 'video/VP8',
      clockRate: 90000,
      payloadType: 96,
      // Feedback messages keep video healthy: retransmit lost packets and let a
      // freshly-subscribed viewer ask the sender for a full keyframe.
      rtcpFeedback: [
        { type: 'nack' },
        { type: 'nack', parameter: 'pli' },
        { type: 'ccm', parameter: 'fir' },
        { type: 'goog-remb' },
      ],
    }),
  ],
};

/**
 * Header extensions the SFU advertises. The MID extension is the important one for a
 * bundled connection: it lets the browser route each incoming RTP stream to the right
 * m-line unambiguously. The timing extensions feed bandwidth estimation.
 */
export const headerExtensions: {
  audio: RTCRtpHeaderExtensionParameters[];
  video: RTCRtpHeaderExtensionParameters[];
} = {
  audio: [useSdesMid(), useAbsSendTime(), useTransportWideCC()],
  video: [useSdesMid(), useAbsSendTime(), useTransportWideCC()],
};
