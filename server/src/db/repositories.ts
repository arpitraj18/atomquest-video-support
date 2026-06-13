import { getDb } from './database';
import { newId, now } from '../ids';
import type {
  ChatMessage,
  Participant,
  Recording,
  RecordingStatus,
  Role,
  Session,
  SessionEvent,
  SessionEventType,
  SessionStatus,
  SharedFile,
  User,
} from '../types';

/* ─── row shapes (snake_case, as stored) ─────────────────────────────────── */

type UserRow = { id: string; email: string; name: string; role: Role; password_hash: string; created_at: string };
type SessionRow = {
  id: string; title: string; status: SessionStatus; agent_id: string; agent_name: string;
  invite_code: string; created_at: string; started_at: string | null; ended_at: string | null;
  queue_status: 'scheduled' | 'queued' | 'accepted';
  csat_score: number | null; csat_comment: string | null;
  disposition: string | null; disposition_notes: string | null;
};
type ParticipantRow = {
  id: string; session_id: string; role: Role; display_name: string; user_id: string | null;
  joined_at: string; left_at: string | null;
};
type EventRow = {
  id: number; session_id: string; type: SessionEventType; actor_name: string | null;
  detail: string | null; created_at: string;
};
type MessageRow = {
  id: string; session_id: string; sender_role: Role; sender_name: string; body: string;
  file_id: string | null; created_at: string;
};
type FileRow = {
  id: string; session_id: string; uploader_name: string; original_name: string; stored_name: string;
  mime_type: string; size_bytes: number; created_at: string;
};
type RecordingRow = {
  id: string; session_id: string; status: RecordingStatus; stored_name: string | null;
  mime_type: string; size_bytes: number | null; started_at: string; ended_at: string | null;
};

/* ─── mappers ────────────────────────────────────────────────────────────── */

const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash, createdAt: r.created_at,
});
const toSession = (r: SessionRow): Session => ({
  id: r.id, title: r.title, status: r.status, agentId: r.agent_id, agentName: r.agent_name,
  inviteCode: r.invite_code, createdAt: r.created_at, startedAt: r.started_at, endedAt: r.ended_at,
  queueStatus: r.queue_status || 'scheduled',
  csatScore: r.csat_score, csatComment: r.csat_comment,
  disposition: r.disposition, dispositionNotes: r.disposition_notes,
});
const toParticipant = (r: ParticipantRow): Participant => ({
  id: r.id, sessionId: r.session_id, role: r.role, displayName: r.display_name, userId: r.user_id,
  joinedAt: r.joined_at, leftAt: r.left_at,
});
const toEvent = (r: EventRow): SessionEvent => ({
  id: r.id, sessionId: r.session_id, type: r.type, actorName: r.actor_name, detail: r.detail, createdAt: r.created_at,
});
const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id, sessionId: r.session_id, senderRole: r.sender_role, senderName: r.sender_name, body: r.body,
  fileId: r.file_id, createdAt: r.created_at,
});
const toFile = (r: FileRow): SharedFile => ({
  id: r.id, sessionId: r.session_id, uploaderName: r.uploader_name, originalName: r.original_name,
  storedName: r.stored_name, mimeType: r.mime_type, sizeBytes: r.size_bytes, createdAt: r.created_at,
});
const toRecording = (r: RecordingRow): Recording => ({
  id: r.id, sessionId: r.session_id, status: r.status, storedName: r.stored_name, mimeType: r.mime_type,
  sizeBytes: r.size_bytes, startedAt: r.started_at, endedAt: r.ended_at,
});

/* ─── users ──────────────────────────────────────────────────────────────── */

export const usersRepo = {
  create(input: { email: string; name: string; role: Role; passwordHash: string }): User {
    const user: User = { id: newId('usr'), createdAt: now(), ...input };
    getDb()
      .prepare('INSERT INTO users(id, email, name, role, password_hash, created_at) VALUES (?,?,?,?,?,?)')
      .run(user.id, user.email, user.name, user.role, user.passwordHash, user.createdAt);
    return user;
  },
  findByEmail(email: string): User | null {
    const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? toUser(row) : null;
  },
  findById(id: string): User | null {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  },
  listAgents(): User[] {
    return (getDb().prepare("SELECT * FROM users WHERE role = 'agent'").all() as UserRow[]).map(toUser);
  },
};

/* ─── sessions ───────────────────────────────────────────────────────────── */

export const sessionsRepo = {
  create(input: { title: string; agentId: string; agentName: string; inviteCode: string; queueStatus?: 'scheduled' | 'queued' }): Session {
    const session: Session = {
      id: newId('ses'),
      title: input.title,
      status: 'scheduled',
      agentId: input.agentId,
      agentName: input.agentName,
      inviteCode: input.inviteCode,
      createdAt: now(),
      startedAt: null,
      endedAt: null,
      queueStatus: input.queueStatus || 'scheduled',
      csatScore: null,
      csatComment: null,
      disposition: null,
      dispositionNotes: null,
    };
    getDb()
      .prepare(
        `INSERT INTO sessions(id, title, status, agent_id, agent_name, invite_code, created_at, started_at, ended_at, queue_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(session.id, session.title, session.status, session.agentId, session.agentName,
        session.inviteCode, session.createdAt, session.startedAt, session.endedAt, session.queueStatus);
    return session;
  },
  findById(id: string): Session | null {
    const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? toSession(row) : null;
  },
  findByInviteCode(code: string): Session | null {
    const row = getDb().prepare('SELECT * FROM sessions WHERE invite_code = ?').get(code) as SessionRow | undefined;
    return row ? toSession(row) : null;
  },
  listByAgent(agentId: string): Session[] {
    return (getDb().prepare('SELECT * FROM sessions WHERE agent_id = ? ORDER BY created_at DESC').all(agentId) as SessionRow[]).map(toSession);
  },
  listAll(): Session[] {
    return (getDb().prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as SessionRow[]).map(toSession);
  },
  listLive(): Session[] {
    return (getDb().prepare("SELECT * FROM sessions WHERE status = 'live' ORDER BY started_at DESC").all() as SessionRow[]).map(toSession);
  },
  countAll(since?: string): number {
    if (since) {
      return (getDb().prepare("SELECT count(*) as c FROM sessions WHERE created_at >= ?").get(since) as { c: number }).c;
    }
    return (getDb().prepare("SELECT count(*) as c FROM sessions").get() as { c: number }).c;
  },
  listEnded(since?: string): Session[] {
    if (since) {
      return (getDb().prepare("SELECT * FROM sessions WHERE status = 'ended' AND ended_at >= ? ORDER BY ended_at DESC").all(since) as SessionRow[]).map(toSession);
    }
    return (getDb().prepare("SELECT * FROM sessions WHERE status = 'ended' ORDER BY ended_at DESC").all() as SessionRow[]).map(toSession);
  },
  setStatus(id: string, status: SessionStatus, timestamps: { startedAt?: string; endedAt?: string } = {}): void {
    const fields: string[] = ['status = ?'];
    const values: unknown[] = [status];
    if (timestamps.startedAt !== undefined) { fields.push('started_at = ?'); values.push(timestamps.startedAt); }
    if (timestamps.endedAt !== undefined) { fields.push('ended_at = ?'); values.push(timestamps.endedAt); }
    values.push(id);
    getDb().prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...(values as never[]));
  },
  updateQueueStatus(id: string, queueStatus: 'scheduled' | 'queued' | 'accepted'): void {
    getDb().prepare('UPDATE sessions SET queue_status = ? WHERE id = ?').run(queueStatus, id);
  },
  updateCSAT(id: string, score: number, comment: string | null): void {
    getDb().prepare('UPDATE sessions SET csat_score = ?, csat_comment = ? WHERE id = ?').run(score, comment, id);
  },
  updateDisposition(id: string, disposition: string, notes: string | null): void {
    getDb().prepare('UPDATE sessions SET disposition = ?, disposition_notes = ? WHERE id = ?').run(disposition, notes, id);
  },
};

/* ─── participants ───────────────────────────────────────────────────────── */

export const participantsRepo = {
  add(input: { sessionId: string; role: Role; displayName: string; userId: string | null }): Participant {
    const participant: Participant = {
      id: newId('par'), joinedAt: now(), leftAt: null, ...input,
    };
    getDb()
      .prepare('INSERT INTO participants(id, session_id, role, display_name, user_id, joined_at, left_at) VALUES (?,?,?,?,?,?,?)')
      .run(participant.id, participant.sessionId, participant.role, participant.displayName,
        participant.userId, participant.joinedAt, participant.leftAt);
    return participant;
  },
  markLeft(id: string): void {
    getDb().prepare('UPDATE participants SET left_at = ? WHERE id = ? AND left_at IS NULL').run(now(), id);
  },
  listBySession(sessionId: string): Participant[] {
    return (getDb().prepare('SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at').all(sessionId) as ParticipantRow[]).map(toParticipant);
  },
  listActive(sessionId: string): Participant[] {
    return (getDb().prepare('SELECT * FROM participants WHERE session_id = ? AND left_at IS NULL ORDER BY joined_at').all(sessionId) as ParticipantRow[]).map(toParticipant);
  },
};

/* ─── session events (immutable timeline) ────────────────────────────────── */

export const eventsRepo = {
  append(sessionId: string, type: SessionEventType, actorName: string | null, detail?: Record<string, unknown>): SessionEvent {
    const createdAt = now();
    const detailJson = detail ? JSON.stringify(detail) : null;
    const result = getDb()
      .prepare('INSERT INTO session_events(session_id, type, actor_name, detail, created_at) VALUES (?,?,?,?,?)')
      .run(sessionId, type, actorName, detailJson, createdAt);
    return { id: Number(result.lastInsertRowid), sessionId, type, actorName: actorName, detail: detailJson, createdAt };
  },
  listBySession(sessionId: string): SessionEvent[] {
    return (getDb().prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY id').all(sessionId) as EventRow[]).map(toEvent);
  },
};

/* ─── chat ───────────────────────────────────────────────────────────────── */

export const messagesRepo = {
  add(input: { sessionId: string; senderRole: Role; senderName: string; body: string; fileId: string | null }): ChatMessage {
    const message: ChatMessage = { id: newId('msg'), createdAt: now(), ...input };
    getDb()
      .prepare('INSERT INTO chat_messages(id, session_id, sender_role, sender_name, body, file_id, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(message.id, message.sessionId, message.senderRole, message.senderName, message.body, message.fileId, message.createdAt);
    return message;
  },
  listBySession(sessionId: string): ChatMessage[] {
    return (getDb().prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at').all(sessionId) as MessageRow[]).map(toMessage);
  },
};

/* ─── shared files ───────────────────────────────────────────────────────── */

export const filesRepo = {
  add(input: Omit<SharedFile, 'id' | 'createdAt'>): SharedFile {
    const file: SharedFile = { id: newId('fil'), createdAt: now(), ...input };
    getDb()
      .prepare(`INSERT INTO shared_files(id, session_id, uploader_name, original_name, stored_name, mime_type, size_bytes, created_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(file.id, file.sessionId, file.uploaderName, file.originalName, file.storedName, file.mimeType, file.sizeBytes, file.createdAt);
    return file;
  },
  findById(id: string): SharedFile | null {
    const row = getDb().prepare('SELECT * FROM shared_files WHERE id = ?').get(id) as FileRow | undefined;
    return row ? toFile(row) : null;
  },
  listBySession(sessionId: string): SharedFile[] {
    return (getDb().prepare('SELECT * FROM shared_files WHERE session_id = ? ORDER BY created_at').all(sessionId) as FileRow[]).map(toFile);
  },
};

/* ─── recordings ─────────────────────────────────────────────────────────── */

export const recordingsRepo = {
  create(input: { sessionId: string; mimeType: string }): Recording {
    const recording: Recording = {
      id: newId('rec'), sessionId: input.sessionId, status: 'recording', storedName: null,
      mimeType: input.mimeType, sizeBytes: null, startedAt: now(), endedAt: null,
    };
    getDb()
      .prepare(`INSERT INTO recordings(id, session_id, status, stored_name, mime_type, size_bytes, started_at, ended_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(recording.id, recording.sessionId, recording.status, recording.storedName, recording.mimeType,
        recording.sizeBytes, recording.startedAt, recording.endedAt);
    return recording;
  },
  update(id: string, patch: Partial<Pick<Recording, 'status' | 'storedName' | 'sizeBytes' | 'endedAt'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) { fields.push('status = ?'); values.push(patch.status); }
    if (patch.storedName !== undefined) { fields.push('stored_name = ?'); values.push(patch.storedName); }
    if (patch.sizeBytes !== undefined) { fields.push('size_bytes = ?'); values.push(patch.sizeBytes); }
    if (patch.endedAt !== undefined) { fields.push('ended_at = ?'); values.push(patch.endedAt); }
    if (fields.length === 0) return;
    values.push(id);
    getDb().prepare(`UPDATE recordings SET ${fields.join(', ')} WHERE id = ?`).run(...(values as never[]));
  },
  findById(id: string): Recording | null {
    const row = getDb().prepare('SELECT * FROM recordings WHERE id = ?').get(id) as RecordingRow | undefined;
    return row ? toRecording(row) : null;
  },
  findActiveBySession(sessionId: string): Recording | null {
    const row = getDb()
      .prepare("SELECT * FROM recordings WHERE session_id = ? AND status = 'recording' ORDER BY started_at DESC LIMIT 1")
      .get(sessionId) as RecordingRow | undefined;
    return row ? toRecording(row) : null;
  },
  listBySession(sessionId: string): Recording[] {
    return (getDb().prepare('SELECT * FROM recordings WHERE session_id = ? ORDER BY started_at DESC').all(sessionId) as RecordingRow[]).map(toRecording);
  },
};
