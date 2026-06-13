import type { Server, Socket } from 'socket.io';
import type { RTCIceCandidate } from 'werift';
import {
  ClientEvents,
  ServerEvents,
  type ChatSendPayload,
  type FileSharePayload,
  type IceCandidatePayload,
  type MediaStatePayload,
  type PresenceParticipant,
  type SdpOfferPayload,
} from './events';
import { verifyAnyToken } from '../auth/tokens';
import { sessionService } from '../services/SessionService';
import { reconnectManager } from '../services/ReconnectManager';
import { recordingService } from '../recording/RecordingService';
import { mediaServer } from '../sfu/MediaServer';
import { eventsRepo, filesRepo, messagesRepo, participantsRepo, recordingsRepo, sessionsRepo } from '../db/repositories';
import { metrics } from '../metrics/metrics';
import { env } from '../env';
import { logger } from '../logger';
import type { AuthContext, Role } from '../types';

interface Presence {
  presenceKey: string;
  participantId: string;
  sessionId: string;
  role: Role;
  displayName: string;
  socketId: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  mediaPublished: boolean;
}

const presenceByKey = new Map<string, Presence>();
const presenceBySocket = new Map<string, Presence>();

let ioRef: Server | null = null;


const presenceKeyFor = (sessionId: string, role: Role, subjectId: string) => `${sessionId}:${role}:${subjectId}`;

const toPublic = (p: Presence): PresenceParticipant => ({
  participantId: p.participantId,
  role: p.role,
  displayName: p.displayName,
  audioEnabled: p.audioEnabled,
  videoEnabled: p.videoEnabled,
});

function roster(sessionId: string, exceptSocketId?: string): PresenceParticipant[] {
  const out: PresenceParticipant[] = [];
  for (const p of presenceByKey.values()) {
    if (p.sessionId === sessionId && p.socketId !== exceptSocketId) out.push(toPublic(p));
  }
  return out;
}

/**
 * Resolve the session and a stable presence key for a connecting socket.
 *  - Customers carry a session-scoped invite token; the session comes from the token.
 *  - Agents carry their session token and pass the sessionId they want to join; we verify
 *    they own it. The presence key is stable across refreshes, which is what makes the
 *    grace-window reconnect recognise a returning participant.
 */
function resolveConnection(socket: Socket): { auth: AuthContext; sessionId: string; presenceKey: string } | null {
  const token = (socket.handshake.auth?.token ?? '') as string;
  const auth = verifyAnyToken(token);
  if (!auth) return null;

  if (auth.role === 'customer') {
    if (!auth.sessionId) return null;
    const session = sessionsRepo.findById(auth.sessionId);
    if (!session || session.status === 'ended') return null;
    return { auth, sessionId: auth.sessionId, presenceKey: presenceKeyFor(auth.sessionId, 'customer', auth.subjectId) };
  }

  // agent
  const sessionId = (socket.handshake.auth?.sessionId ?? '') as string;
  if (!sessionId) return null;
  const session = sessionsRepo.findById(sessionId);
  if (!session || session.agentId !== auth.subjectId) return null;
  if (session.status === 'ended') return null;
  return { auth, sessionId, presenceKey: presenceKeyFor(sessionId, 'agent', auth.subjectId) };
}

export function attachSignaling(io: Server): void {
  ioRef = io;

  // Authenticate every socket before it joins.
  io.use((socket, next) => {
    const resolved = resolveConnection(socket);
    if (!resolved) return next(new Error('unauthorized'));
    socket.data.auth = resolved.auth;
    socket.data.sessionId = resolved.sessionId;
    socket.data.presenceKey = resolved.presenceKey;
    next();
  });

  io.on('connection', (socket) => {
    const sessionId = socket.data.sessionId as string;
    const auth = socket.data.auth as AuthContext;
    const presenceKey = socket.data.presenceKey as string;

    const reconnecting = reconnectManager.isPending(presenceKey);
    reconnectManager.cancel(presenceKey);

    let participantId: string;
    if (reconnecting && presenceByKey.has(presenceKey)) {
      // Seamless return: reuse the existing participant record, replace the dead media peer.
      const existing = presenceByKey.get(presenceKey)!;
      participantId = existing.participantId;
      mediaServer.removePeer(sessionId, participantId).catch(() => undefined);
      existing.socketId = socket.id;
      existing.mediaPublished = false;
      presenceBySocket.set(socket.id, existing);
      eventsRepo.append(sessionId, 'participant_reconnected', existing.displayName);
      metrics.reconnections.inc();
      logger.info({ sessionId, participantId }, 'participant reconnected within grace window');
    } else {
      // Fresh join. If a stale socket exists for this key (duplicate tab), drop the old one.
      const stale = presenceByKey.get(presenceKey);
      if (stale) {
        ioRef?.sockets.sockets.get(stale.socketId)?.disconnect(true);
        mediaServer.removePeer(sessionId, stale.participantId).catch(() => undefined);
        sessionService.markLeft(stale.participantId);
      }

      // Enforce 1:1: If another customer is already in the session, block the new joiner.
      if (auth.role === 'customer') {
        let hasOtherCustomer = false;
        for (const [key, p] of presenceByKey.entries()) {
          if (p.sessionId === sessionId && p.role === 'customer' && key !== presenceKey) {
             hasOtherCustomer = true;
             break;
          }
        }
        if (hasOtherCustomer) {
           socket.emit(ServerEvents.Errored, { message: 'A customer is already active in this session. Only one customer is allowed.' });
           socket.disconnect(true);
           return;
        }
      }

      sessionService.ensureLive(sessionId);
      const participant =
        auth.role === 'agent'
          ? sessionService.registerAgentParticipant({
              sessionId,
              userId: auth.subjectId,
              displayName: auth.displayName,
            })
          : participantsRepo.add({ sessionId, role: 'customer', displayName: auth.displayName, userId: null });
      participantId = participant.id;

      const presence: Presence = {
        presenceKey,
        participantId,
        sessionId,
        role: auth.role,
        displayName: auth.displayName,
        socketId: socket.id,
        audioEnabled: true,
        videoEnabled: true,
        mediaPublished: false,
      };
      presenceByKey.set(presenceKey, presence);
      presenceBySocket.set(socket.id, presence);
      eventsRepo.append(sessionId, 'participant_joined', auth.displayName, { role: auth.role });
      socket.to(sessionId).emit(ServerEvents.PeerJoined, { participant: toPublic(presence) });
    }

    socket.join(sessionId);

    // Build the SFU peer for this socket and relay its ICE upward.
    mediaServer.createPeer({
      sessionId,
      participantId,
      role: auth.role,
      displayName: auth.displayName,
      onIceCandidate: (candidate) => socket.emit(ServerEvents.IceCandidate, { candidate: candidate.toJSON() }),
      onConnectionState: (state) => logger.debug({ sessionId, participantId, state }, 'peer connection state'),
    });

    // Tell the joiner who is already here and the current recording status.
    const activeRecording = recordingsRepo.findActiveBySession(sessionId);
    const self = presenceBySocket.get(socket.id)!;
    socket.emit(ServerEvents.Joined, {
      self: toPublic(self),
      peers: roster(sessionId, socket.id),
      session: (() => {
        const s = sessionsRepo.findById(sessionId)!;
        return { id: s.id, title: s.title, status: s.status, agentName: s.agentName };
      })(),
      recording: { active: !!activeRecording, status: activeRecording?.status ?? null },
      chatHistory: messagesRepo.listBySession(sessionId).map(msg => {
         if (msg.fileId) {
            const file = filesRepo.findById(msg.fileId);
            return {
               ...msg,
               file: file ? { id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes } : undefined
            };
         }
         return msg;
      }),
    });

    /* ─── WebRTC signaling ─── */

    socket.on(ClientEvents.SdpOffer, async (payload: SdpOfferPayload) => {
      try {
        const answer = await mediaServer.handleOffer(sessionId, participantId, payload.sdp);
        if (answer) socket.emit(ServerEvents.SdpAnswer, answer);
        const presence = presenceBySocket.get(socket.id);
        if (presence && !presence.mediaPublished) {
          presence.mediaPublished = true;
          eventsRepo.append(sessionId, 'media_published', presence.displayName);
        }
      } catch (err) {
        metrics.errors.inc({ area: 'signaling' });
        logger.error({ err, sessionId, participantId }, 'failed to handle SDP offer');
        socket.emit(ServerEvents.Errored, { message: 'Could not establish the media connection. Try rejoining.' });
      }
    });

    socket.on(ClientEvents.IceCandidate, async (payload: IceCandidatePayload) => {
      await mediaServer.addIceCandidate(sessionId, participantId, payload.candidate as RTCIceCandidate);
    });

    /* ─── chat ─── */

    socket.on(ClientEvents.ChatSend, (payload: ChatSendPayload) => {
      const body = (payload?.body ?? '').toString().trim();
      if (!body) return;
      if (body.length > 4000) return;
      const presence = presenceBySocket.get(socket.id);
      if (!presence) return;
      const message = messagesRepo.add({
        sessionId,
        senderRole: presence.role,
        senderName: presence.displayName,
        body,
        fileId: null,
      });
      eventsRepo.append(sessionId, 'chat_message', presence.displayName);
      metrics.chatMessages.inc();
      io.to(sessionId).emit(ServerEvents.ChatMessage, { message });
    });

    socket.on(ClientEvents.FileShare, (payload: FileSharePayload) => {
      const presence = presenceBySocket.get(socket.id);
      if (!presence) return;
      const file = filesRepo.findById(payload?.fileId ?? '');
      if (!file || file.sessionId !== sessionId) {
        socket.emit(ServerEvents.Errored, { message: 'That file is not part of this session.' });
        return;
      }
      const message = messagesRepo.add({
        sessionId,
        senderRole: presence.role,
        senderName: presence.displayName,
        body: file.originalName,
        fileId: file.id,
      });
      eventsRepo.append(sessionId, 'file_shared', presence.displayName, { originalName: file.originalName });
      metrics.filesShared.inc();
      io.to(sessionId).emit(ServerEvents.ChatMessage, {
        message: {
          ...message,
          file: { id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes },
        },
      });
    });

    /* ─── media state (mute / camera) ─── */

    socket.on(ClientEvents.MediaState, (payload: MediaStatePayload) => {
      const presence = presenceBySocket.get(socket.id);
      if (!presence) return;
      const audioEnabled = !!payload.audioEnabled;
      const videoEnabled = !!payload.videoEnabled;
      if (presence.audioEnabled !== audioEnabled) {
        eventsRepo.append(sessionId, audioEnabled ? 'audio_unmuted' : 'audio_muted', presence.displayName);
      }
      if (presence.videoEnabled !== videoEnabled) {
        eventsRepo.append(sessionId, videoEnabled ? 'video_enabled' : 'video_disabled', presence.displayName);
      }
      presence.audioEnabled = audioEnabled;
      presence.videoEnabled = videoEnabled;
      socket.to(sessionId).emit(ServerEvents.PeerMedia, { participantId, audioEnabled, videoEnabled });
    });

    /* ─── recording (agent only) ─── */

    socket.on(ClientEvents.RecordingStart, async () => {
      if (auth.role !== 'agent') {
        socket.emit(ServerEvents.Errored, { message: 'Only the agent can start recording.' });
        return;
      }
      try {
        const recording = await recordingService.start(sessionId);
        eventsRepo.append(sessionId, 'recording_started', auth.displayName);
        io.to(sessionId).emit(ServerEvents.RecordingStatus, { status: recording.status, recordingId: recording.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start recording.';
        socket.emit(ServerEvents.Errored, { message });
      }
    });

    socket.on(ClientEvents.RecordingStop, async () => {
      if (auth.role !== 'agent') {
        socket.emit(ServerEvents.Errored, { message: 'Only the agent can stop recording.' });
        return;
      }
      try {
        const recording = await recordingService.stop(sessionId);
        eventsRepo.append(sessionId, 'recording_stopped', auth.displayName);
        io.to(sessionId).emit(ServerEvents.RecordingStatus, { status: recording.status, recordingId: recording.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not stop recording.';
        socket.emit(ServerEvents.Errored, { message });
      }
    });

    /* ─── ending the call (either party) ─── */

    socket.on(ClientEvents.SessionEnd, async () => {
      try {
        await sessionService.endSession(sessionId, { name: auth.displayName, role: auth.role });
        io.to(sessionId).emit(ServerEvents.SessionEnded, { endedBy: { name: auth.displayName, role: auth.role } });
        cleanupSession(sessionId);
        io.in(sessionId).disconnectSockets(true);
      } catch (err) {
        logger.error({ err, sessionId }, 'failed to end session');
      }
    });

    /* ─── disconnect (drop → grace window) ─── */

    socket.on('disconnect', () => {
      const presence = presenceBySocket.get(socket.id);
      presenceBySocket.delete(socket.id);
      if (!presence || presence.socketId !== socket.id) return; // already replaced by a newer socket

      // Tear down the dead media peer but hold the participant's place for the grace window.
      mediaServer.removePeer(sessionId, presence.participantId).catch(() => undefined);
      eventsRepo.append(sessionId, 'participant_dropped', presence.displayName);

      reconnectManager.schedule(presence.presenceKey, sessionId, env.RECONNECT_GRACE_SECONDS, () => {
        // Grace expired: now they have truly left.
        presenceByKey.delete(presence.presenceKey);
        sessionService.markLeft(presence.participantId);
        eventsRepo.append(sessionId, 'participant_left', presence.displayName);
        ioRef?.to(sessionId).emit(ServerEvents.PeerLeft, { participantId: presence.participantId });
      });
    });
  });
}

/** Remove all in-memory presence for a session (used when it ends). */
function cleanupSession(sessionId: string): void {
  for (const [key, p] of presenceByKey) {
    if (p.sessionId === sessionId) {
      reconnectManager.cancel(key);
      presenceByKey.delete(key);
      presenceBySocket.delete(p.socketId);
    }
  }
}

/** Returns the Socket.IO server instance. Throws if called before attachSignaling. */
export function getIo(): Server {
  if (!ioRef) throw new Error('Socket.IO not yet initialized');
  return ioRef;
}

/**
 * Called by the admin route when an operator force-ends a session, so connected sockets
 * are notified and disconnected just as if a participant had ended it.
 */
export function forceEndSessionRealtime(sessionId: string, endedBy: { name: string; role: Role }): void {
  if (!ioRef) return;
  ioRef.to(sessionId).emit(ServerEvents.SessionEnded, { endedBy });
  cleanupSession(sessionId);
  ioRef.in(sessionId).disconnectSockets(true);
}
