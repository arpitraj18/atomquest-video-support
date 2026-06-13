/**
 * REST API client. Stores the auth token in memory (primary) with
 * localStorage as a persistence fallback across page reloads.
 */

const TOKEN_KEY = 'aq_token';

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return token;
}

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/* ── Fetch wrapper ── */

interface ApiError {
  error: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  const currentToken = getToken();
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  // Don't set Content-Type for FormData (browser sets boundary)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new ApiRequestError(401, 'unauthorized', 'Session expired');
  }

  if (!res.ok) {
    const body: ApiError = await res.json().catch(() => ({
      error: 'unknown',
      message: res.statusText,
    }));
    throw new ApiRequestError(res.status, body.error, body.message);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return undefined as T;
}

/* ── Auth ── */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'agent' | 'customer';
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<{ user: User }> {
  return apiFetch<{ user: User }>('/api/auth/me');
}

/* ── Sessions ── */

export interface Session {
  id: string;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  agentId: string;
  agentName: string;
  inviteCode: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  csatScore?: number | null;
  csatComment?: string | null;
  disposition?: string | null;
  dispositionNotes?: string | null;
  queueStatus?: 'queued' | 'active';
}

export interface SessionWithParticipants extends Session {
  activeParticipants?: number;
}

export async function createSession(title?: string): Promise<{ session: Session; inviteCode: string; inviteLink: string }> {
  return apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function listSessions(): Promise<{ sessions: SessionWithParticipants[] }> {
  return apiFetch('/api/sessions');
}

export async function getSession(id: string): Promise<{ session: Session; participants: Participant[]; activeParticipants: number }> {
  return apiFetch(`/api/sessions/${id}`);
}

export async function endSession(id: string): Promise<{ session: Session }> {
  return apiFetch(`/api/sessions/${id}/end`, { method: 'POST' });
}

/* ── History ── */

export interface Participant {
  id: string;
  sessionId: string;
  role: 'agent' | 'customer';
  displayName: string;
  userId: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface SessionEvent {
  id: number;
  sessionId: string;
  type: string;
  actorName: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderRole: 'agent' | 'customer';
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
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  status: 'recording' | 'processing' | 'ready' | 'failed';
  mimeType: string;
  sizeBytes: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface SessionHistory {
  session: Session;
  participants: Participant[];
  events: SessionEvent[];
  messages: ChatMessage[];
  files: SharedFile[];
  recordings: Recording[];
}

export async function getSessionHistory(id: string): Promise<SessionHistory> {
  return apiFetch(`/api/sessions/${id}/history`);
}

/* ── Invites ── */

export interface InviteInfo {
  sessionId: string;
  title: string;
  agentName: string;
  joinable: boolean;
  queueStatus?: string;
}

export async function describeInvite(code: string): Promise<InviteInfo> {
  return apiFetch(`/api/invites/${code}`);
}

export async function acceptInvite(code: string, displayName: string): Promise<{ token: string; participantId: string; session: Session }> {
  const data = await apiFetch<{ token: string; participantId: string; session: Session }>(`/api/invites/${code}/accept`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
  setToken(data.token);
  return data;
}

/* ── Files ── */

export async function uploadFile(sessionId: string, file: File): Promise<{ file: { id: string; name: string; mimeType: string; sizeBytes: number } }> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/api/sessions/${sessionId}/files`, {
    method: 'POST',
    body: form,
  });
}

export function fileDownloadUrl(sessionId: string, fileId: string): string {
  return `/api/sessions/${sessionId}/files/${fileId}?token=${token ?? ''}`;
}

/* ── Recordings ── */

export async function listRecordings(sessionId: string): Promise<{ recordings: Recording[] }> {
  return apiFetch(`/api/sessions/${sessionId}/recordings`);
}

export function recordingDownloadUrl(sessionId: string, recordingId: string): string {
  return `/api/sessions/${sessionId}/recordings/${recordingId}/download?token=${token ?? ''}`;
}

/* ── Admin ── */

export async function getAdminLive(): Promise<{ sessions: SessionWithParticipants[] }> {
  return apiFetch('/api/admin/sessions/live');
}

export async function getAdminPastSessions(): Promise<{ sessions: SessionWithParticipants[] }> {
  return apiFetch('/api/admin/sessions');
}

export async function getAdminSessionHistory(sessionId: string): Promise<SessionHistory> {
  return apiFetch(`/api/admin/sessions/${sessionId}`);
}

export interface AdminSupportAgent {
  id: string;
  name: string;
  status: 'available' | 'offline' | 'in_call';
}

export interface AdminMetrics {
  totalCalls: number;
  averageDurationSeconds: number;
  csat: number;
  supportAgents: { id: string; name: string; status: string }[];
}

export async function getAdminMetrics(period?: string): Promise<AdminMetrics> {
  const url = period ? `/api/admin/metrics?period=${period}` : '/api/admin/metrics';
  return apiFetch(url);
}

export async function adminEndSession(id: string): Promise<{ session: Session }> {
  return apiFetch(`/api/admin/sessions/${id}/end`, { method: 'POST' });
}
