/**
 * Socket.IO client wrapper. Mirrors the server's event contract exactly.
 */

import { io, type Socket } from 'socket.io-client';

/* ── Event name constants (mirror server/src/realtime/events.ts) ── */

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

/* ── Payload types (match server) ── */

export interface PresenceParticipant {
  participantId: string;
  role: 'agent' | 'customer';
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export interface JoinedPayload {
  self: PresenceParticipant;
  peers: PresenceParticipant[];
  session: { id: string; title: string; status: string; agentName: string };
  recording: { active: boolean; status: string | null };
  chatHistory: any[];
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
  message: {
    id: string;
    sessionId: string;
    senderRole: 'agent' | 'customer';
    senderName: string;
    body: string;
    fileId: string | null;
    createdAt: string;
    file?: { id: string; name: string; mimeType: string; sizeBytes: number };
  };
}

export interface RecordingStatusPayload {
  status: 'recording' | 'processing' | 'ready' | 'failed';
  recordingId: string;
}

export interface SessionEndedPayload {
  endedBy: { name: string; role: 'agent' | 'customer' };
}

/* ── Factory ── */

export function createSocket(token: string, sessionId?: string): Socket {
  return io('/', {
    auth: { token, sessionId },
    transports: ['websocket', 'polling'],
    reconnection: false, // we handle reconnect at the app level
  });
}

export type { Socket };
