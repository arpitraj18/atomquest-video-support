import type { ChatMessage, Participant, RecordingStatus, Role, Session } from '../types';

/**
 * The realtime contract between browser and server. Names are grouped by area and kept
 * stable; the client mirrors these strings. Signaling (SDP/ICE), presence, chat, media
 * state, recording status, and session end all travel over this one socket.
 */
export const ClientEvents = {
  SdpOffer: 'sdp:offer',
  IceCandidate: 'ice:candidate',
  ChatSend: 'chat:send',
  FileShare: 'file:share',
  MediaState: 'media:state',
  RecordingStart: 'recording:start',
  RecordingStop: 'recording:stop',
  SessionEnd: 'session:end',
} as const;

export const ServerEvents = {
  Joined: 'joined',
  SdpAnswer: 'sdp:answer',
  IceCandidate: 'ice:candidate',
  PeerJoined: 'peer:joined',
  PeerLeft: 'peer:left',
  PeerMedia: 'peer:media',
  ChatMessage: 'chat:message',
  RecordingStatus: 'recording:status',
  SessionEnded: 'session:ended',
  QueueUpdated: 'queue:updated',
  Errored: 'error',
} as const;

/* ─── client → server payloads ─── */
export interface SdpOfferPayload {
  sdp: string;
}
export interface IceCandidatePayload {
  candidate: unknown; // RTCIceCandidateInit / werift candidate JSON
}
export interface ChatSendPayload {
  body: string;
}
export interface FileSharePayload {
  fileId: string;
}
export interface MediaStatePayload {
  audioEnabled: boolean;
  videoEnabled: boolean;
}

/* ─── server → client payloads ─── */
export interface PresenceParticipant {
  participantId: string;
  role: Role;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
export interface JoinedPayload {
  self: PresenceParticipant;
  peers: PresenceParticipant[];
  session: Pick<Session, 'id' | 'title' | 'status' | 'agentName'>;
  recording: { active: boolean; status: RecordingStatus | null };
  chatHistory: ChatMessage[];
}
export interface SdpAnswerPayload {
  sdp: string;
  type: string;
}
export interface PeerMediaPayload {
  participantId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
export interface ChatMessagePayload {
  message: ChatMessage & { file?: { id: string; name: string; mimeType: string; sizeBytes: number } };
}
export interface RecordingStatusPayload {
  status: RecordingStatus;
  recordingId: string;
}
export interface SessionEndedPayload {
  endedBy: { name: string; role: Role };
}

export type { Participant };
