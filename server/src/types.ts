/**
 * Domain types shared across the persistence, service, signaling, and SFU layers.
 * Keeping these in one place means the database rows, the REST responses, and the
 * realtime payloads all speak the same vocabulary.
 */

export type Role = 'agent' | 'customer';

export type SessionStatus = 'scheduled' | 'live' | 'ended';

export type RecordingStatus = 'recording' | 'processing' | 'ready' | 'failed';

/** Events appended to a session's immutable timeline (queryable after the fact). */
export type SessionEventType =
  | 'session_created'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_dropped'
  | 'participant_reconnected'
  | 'media_published'
  | 'audio_muted'
  | 'audio_unmuted'
  | 'video_enabled'
  | 'video_disabled'
  | 'chat_message'
  | 'file_shared'
  | 'recording_started'
  | 'recording_stopped'
  | 'session_ended'
  | 'queue_updated';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  agentId: string;
  agentName: string;
  inviteCode: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  queueStatus: 'scheduled' | 'queued' | 'accepted';
  csatScore: number | null;
  csatComment: string | null;
  disposition: string | null;
  dispositionNotes: string | null;
}

export interface Participant {
  id: string;
  sessionId: string;
  role: Role;
  displayName: string;
  userId: string | null; // null for invited customers (no account)
  joinedAt: string;
  leftAt: string | null;
}

export interface SessionEvent {
  id: number;
  sessionId: string;
  type: SessionEventType;
  actorName: string | null;
  detail: string | null; // small JSON blob with event-specific data
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderRole: Role;
  senderName: string;
  body: string;
  fileId: string | null;
  createdAt: string;
}

export interface SharedFile {
  id: string;
  sessionId: string;
  uploaderName: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  status: RecordingStatus;
  storedName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  startedAt: string;
  endedAt: string | null;
}

/** The verified identity attached to an authenticated request or socket. */
export interface AuthContext {
  role: Role;
  /** Stable identifier: the user id for an agent, the participant token id for a customer. */
  subjectId: string;
  displayName: string;
  /** Present only for customer invite tokens — the session they are allowed into. */
  sessionId?: string;
}
