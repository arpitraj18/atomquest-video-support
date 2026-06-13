import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../errors';
import { parseBody } from '../validate';
import { sessionService } from '../../services/SessionService';

export const invitesRouter = Router();

// Invite endpoints are unauthenticated by design (a customer has no account), so they are
// rate limited to blunt brute-force guessing of invite codes.
const inviteLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
invitesRouter.use(inviteLimiter);

/** What a customer sees before joining: the session title and who is hosting. */
invitesRouter.get(
  '/:code',
  asyncHandler(async (req, res) => {
    res.json(sessionService.describeInvite(req.params.code));
  }),
);

const acceptSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});

/** Accept an invite: returns a token scoped to this one session for the customer. */
invitesRouter.post(
  '/:code/accept',
  asyncHandler(async (req, res) => {
    const { displayName } = parseBody(acceptSchema, req.body);
    const { token, session, participant } = sessionService.acceptInvite(req.params.code, displayName);
    res.json({
      token,
      participantId: participant.id,
      session: { id: session.id, title: session.title, agentName: session.agentName, status: session.status },
    });
  }),
);
