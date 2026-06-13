import {
  eventsRepo,
  filesRepo,
  messagesRepo,
  participantsRepo,
  recordingsRepo,
  sessionsRepo,
} from '../db/repositories';
import { issueInviteToken } from '../auth/tokens';
import { newId, newInviteCode } from '../ids';
import { env } from '../env';
import { logger } from '../logger';
import { metrics } from '../metrics/metrics';
import { recordingService } from '../recording/RecordingService';
import { mediaServer } from '../sfu/MediaServer';
import { badRequest, forbidden, notFound } from '../http/errors';
import type { Participant, Role, Session } from '../types';

export interface SessionHistory {
  session: Session;
  participants: Participant[];
  events: ReturnType<typeof eventsRepo.listBySession>;
  messages: ReturnType<typeof messagesRepo.listBySession>;
  files: ReturnType<typeof filesRepo.listBySession>;
  recordings: ReturnType<typeof recordingsRepo.listBySession>;
}

function inviteLink(code: string): string {
  return `${env.WEB_ORIGIN}/join/${code}`;
}

/**
 * Orchestrates everything about a session's life that isn't a raw transport concern:
 * creating it, letting a customer in via an invite, tracking who is present, ending it
 * cleanly, and assembling its full history for the dashboard.
 */
export const sessionService = {
  /* ─── creation & invites ─── */

  createSession(agent: { id: string; name: string }, title: string): { session: Session; inviteCode: string; inviteLink: string } {
    const cleanTitle = title.trim() || 'Support session';
    const session = sessionsRepo.create({
      title: cleanTitle,
      agentId: agent.id,
      agentName: agent.name,
      inviteCode: newInviteCode(),
    });
    eventsRepo.append(session.id, 'session_created', agent.name, { title: cleanTitle });
    metrics.sessionsCreated.inc();
    logger.info({ sessionId: session.id, agentId: agent.id }, 'session created');
    return { session, inviteCode: session.inviteCode, inviteLink: inviteLink(session.inviteCode) };
  },

  /** Public lookup for the customer pre-join screen. Reveals only what a joiner needs. */
  describeInvite(code: string): { sessionId: string; title: string; agentName: string; joinable: boolean; queueStatus?: string } {
    const session = sessionsRepo.findByInviteCode(code);
    if (!session) throw notFound('This invite link is not valid');
    return {
      sessionId: session.id,
      title: session.title,
      agentName: session.agentName,
      joinable: session.status !== 'ended',
      queueStatus: session.queueStatus ?? undefined,
    };
  },

  /**
   * A customer accepts an invite: we mint a token scoped to this one session and register
   * them as a participant. The token — not the link — is what authorises the socket.
   */
  acceptInvite(code: string, displayName: string): { token: string; session: Session; participant: Participant } {
    const session = sessionsRepo.findByInviteCode(code);
    if (!session) throw notFound('This invite link is not valid');
    if (session.status === 'ended') throw forbidden('This session has already ended');

    const cleanName = displayName.trim();
    if (cleanName.length < 1 || cleanName.length > 60) {
      throw badRequest('Enter a name between 1 and 60 characters');
    }

    const inviteId = newId('inv');
    const participant = participantsRepo.add({
      sessionId: session.id,
      role: 'customer',
      displayName: cleanName,
      userId: null,
    });
    const token = issueInviteToken({ sessionId: session.id, displayName: cleanName, inviteId });
    return { token, session, participant };
  },

  /* ─── presence ─── */

  /** Marks a session live on the first join and records the start time. */
  ensureLive(sessionId: string): void {
    const session = sessionsRepo.findById(sessionId);
    if (session && session.status === 'scheduled') {
      sessionsRepo.setStatus(sessionId, 'live', { startedAt: new Date().toISOString() });
    }
  },

  registerAgentParticipant(input: { sessionId: string; userId: string; displayName: string }): Participant {
    return participantsRepo.add({
      sessionId: input.sessionId,
      role: 'agent',
      displayName: input.displayName,
      userId: input.userId,
    });
  },

  markLeft(participantId: string): void {
    participantsRepo.markLeft(participantId);
  },

  /* ─── ending ─── */

  /**
   * Ends a session: stop any recording, tear down the media room, mark every remaining
   * participant as gone, flip the status to ended, and log who ended it. Either party may
   * trigger this.
   */
  async endSession(sessionId: string, endedBy: { name: string; role: Role }): Promise<Session> {
    const session = sessionsRepo.findById(sessionId);
    if (!session) throw notFound('Session not found');
    if (session.status === 'ended') return session;

    await recordingService.stopIfActive(sessionId).catch((err) =>
      logger.error({ err, sessionId }, 'failed to stop recording during session end'),
    );
    await mediaServer.closeRoom(sessionId);

    for (const participant of participantsRepo.listActive(sessionId)) {
      participantsRepo.markLeft(participant.id);
    }

    sessionsRepo.setStatus(sessionId, 'ended', { endedAt: new Date().toISOString() });
    eventsRepo.append(sessionId, 'session_ended', endedBy.name, { role: endedBy.role });
    metrics.callsEnded.inc({ ended_by: endedBy.role });
    logger.info({ sessionId, endedBy }, 'session ended');

    const ended = sessionsRepo.findById(sessionId);
    return ended ?? session;
  },

  /* ─── reads ─── */

  getOwnedSession(agentId: string, sessionId: string): Session {
    const session = sessionsRepo.findById(sessionId);
    if (!session) throw notFound('Session not found');
    if (session.agentId !== agentId) throw forbidden('You do not own this session');
    return session;
  },

  listForAgent(agentId: string): Session[] {
    return sessionsRepo.listByAgent(agentId);
  },

  buildHistory(sessionId: string): SessionHistory {
    const session = sessionsRepo.findById(sessionId);
    if (!session) throw notFound('Session not found');
    return {
      session,
      participants: participantsRepo.listBySession(sessionId),
      events: eventsRepo.listBySession(sessionId),
      messages: messagesRepo.listBySession(sessionId),
      files: filesRepo.listBySession(sessionId),
      recordings: recordingsRepo.listBySession(sessionId),
    };
  },
};
