import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors';
import { parseBody } from '../validate';
import { requireAuth, requireAgent, requireSessionAccess } from '../../auth/guards';
import { sessionService } from '../../services/SessionService';
import { sessionsRepo, participantsRepo } from '../../db/repositories';
import { forceEndSessionRealtime, getIo } from '../../realtime/signaling';
import { ServerEvents } from '../../realtime/events';

import rateLimit from 'express-rate-limit';

const queueRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many queue requests. Please try again later.' },
});

export const sessionsRouter = Router();

// Customer / Public routes
sessionsRouter.post('/queue', queueRateLimiter, asyncHandler(async (_req, res) => {
  const { session, inviteCode, inviteLink } = sessionService.createSession(
    { id: 'system', name: 'System' },
    'Customer Support Request'
  );
  sessionsRepo.updateQueueStatus(session.id, 'queued');
  getIo().emit(ServerEvents.QueueUpdated, {});
  res.status(201).json({ session, inviteCode, inviteLink });
}));

sessionsRouter.post('/:sessionId/csat', requireAuth, requireSessionAccess, asyncHandler(async (req, res) => {
  const { score, comment } = parseBody(z.object({ score: z.number().min(1).max(5), comment: z.string().nullable().default(null) }), req.body);
  sessionsRepo.updateCSAT(req.params.sessionId, score, comment);
  res.json({ success: true });
}));

// Everything below is an agent action.
sessionsRouter.use(requireAuth, requireAgent);

sessionsRouter.post('/:sessionId/disposition', asyncHandler(async (req, res) => {
  const { disposition, notes } = parseBody(z.object({ disposition: z.string(), notes: z.string().nullable().default(null) }), req.body);
  sessionsRepo.updateDisposition(req.params.sessionId, disposition, notes);
  res.json({ success: true });
}));

const createSchema = z.object({
  title: z.string().trim().max(120).default('Support session'),
});

/** Create a session and get back the shareable invite link. */
sessionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title } = parseBody(createSchema, req.body);
    const { session, inviteCode, inviteLink } = sessionService.createSession(
      { id: req.auth!.subjectId, name: req.auth!.displayName },
      title,
    );
    res.status(201).json({ session, inviteCode, inviteLink });
  }),
);

/** List the calling agent's sessions, newest first, with a live participant count. */
sessionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sessions = sessionService.listForAgent(req.auth!.subjectId).map((session) => ({
      ...session,
      activeParticipants: participantsRepo.listActive(session.id).length,
    }));
    res.json({ sessions });
  }),
);

/** Fetch a single owned session plus who is currently in it. */
sessionsRouter.get(
  '/:sessionId',
  requireSessionAccess,
  asyncHandler(async (req, res) => {
    const session = sessionService.getOwnedSession(req.auth!.subjectId, req.params.sessionId);
    res.json({
      session,
      participants: participantsRepo.listBySession(session.id),
      activeParticipants: participantsRepo.listActive(session.id),
    });
  }),
);

/** The complete record for a session: timeline, chat, files, recordings. */
sessionsRouter.get(
  '/:sessionId/history',
  requireSessionAccess,
  asyncHandler(async (req, res) => {
    sessionService.getOwnedSession(req.auth!.subjectId, req.params.sessionId);
    res.json(sessionService.buildHistory(req.params.sessionId));
  }),
);

/** End a session from the console (the in-call control uses the socket equivalent). */
sessionsRouter.post(
  '/:sessionId/end',
  requireSessionAccess,
  asyncHandler(async (req, res) => {
    const session = await sessionService.endSession(req.params.sessionId, {
      name: req.auth!.displayName,
      role: 'agent',
    });
    forceEndSessionRealtime(session.id, { name: req.auth!.displayName, role: 'agent' });
    res.json({ session });
  }),
);
