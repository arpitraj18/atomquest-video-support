import { Router } from 'express';
import { asyncHandler } from '../errors';
import { requireAuth, requireAgent } from '../../auth/guards';
import { sessionService } from '../../services/SessionService';
import { eventsRepo, participantsRepo, sessionsRepo, usersRepo } from '../../db/repositories';
import { forceEndSessionRealtime } from '../../realtime/signaling';
import { agentStatus } from './auth.routes';

function durationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt) return null;
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
}

/**
 * Operator dashboard. Support staff are trusted operators, so any authenticated agent may
 * oversee all sessions here (not just their own). A dedicated `admin` role could gate this
 * further; that is called out as a known simplification in the README.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAgent);

adminRouter.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const period = req.query.period as string;
    let since: string | undefined;
    if (period === '7d') {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (period === 'today') {
      since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    } else if (period === '30d') {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const totalCalls = sessionsRepo.countAll(since);
    const endedSessions = sessionsRepo.listEnded(since);
    
    let totalDuration = 0;
    let validDurationCount = 0;
    let totalCsat = 0;
    let csatCount = 0;

    for (const session of endedSessions) {
      if (session.startedAt && session.endedAt) {
        totalDuration += durationSeconds(session.startedAt, session.endedAt) || 0;
        validDurationCount++;
      }
      if (session.csatScore) {
        totalCsat += session.csatScore;
        csatCount++;
      }
    }
    const averageDurationSeconds = validDurationCount > 0 ? Math.round(totalDuration / validDurationCount) : 0;
    const csat = csatCount > 0 ? Number((totalCsat / csatCount).toFixed(1)) : null;
    
    const supportAgents = usersRepo.listAgents().map(u => ({ id: u.id, name: u.name, status: agentStatus.get(u.id) || 'online' }));
    
    res.json({
      totalCalls,
      averageDurationSeconds,
      csat,
      supportAgents,
    });
  }),
);

/** Every live session right now, with who is in it and how long it has been running. */
adminRouter.get(
  '/sessions/live',
  asyncHandler(async (_req, res) => {
    const sessions = sessionsRepo.listLive().map((session) => ({
      ...session,
      participants: participantsRepo.listActive(session.id),
      durationSeconds: durationSeconds(session.startedAt, null),
    }));
    res.json({ sessions });
  }),
);

/** Full session history across all agents, newest first. */
adminRouter.get(
  '/sessions',
  asyncHandler(async (_req, res) => {
    const sessions = sessionsRepo.listAll().map((session) => ({
      ...session,
      participantCount: participantsRepo.listBySession(session.id).length,
      eventCount: eventsRepo.listBySession(session.id).length,
      durationSeconds: durationSeconds(session.startedAt, session.endedAt),
    }));
    res.json({ sessions });
  }),
);

/** The complete event log and records for any session. */
adminRouter.get(
  '/sessions/:sessionId',
  asyncHandler(async (req, res) => {
    res.json(sessionService.buildHistory(req.params.sessionId));
  }),
);

/** Force a session to end — the operator's kill switch. */
adminRouter.post(
  '/sessions/:sessionId/end',
  asyncHandler(async (req, res) => {
    const session = await sessionService.endSession(req.params.sessionId, {
      name: `${req.auth!.displayName} (operator)`,
      role: 'agent',
    });
    forceEndSessionRealtime(session.id, { name: `${req.auth!.displayName} (operator)`, role: 'agent' });
    res.json({ session });
  }),
);
