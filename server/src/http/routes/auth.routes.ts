import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, unauthorized } from '../errors';
import { parseBody } from '../validate';
import { usersRepo } from '../../db/repositories';
import { verifyPassword } from '../../auth/passwords';
import { issueAgentToken } from '../../auth/tokens';
import { requireAuth, requireAgent } from '../../auth/guards';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Agent login. Customers never log in — they join through an invite link instead. */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const user = usersRepo.findByEmail(email.toLowerCase());
    // Verify even when the user is missing to avoid leaking which emails exist (timing).
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await verifyPassword(password, hash);
    if (!user || user.role !== 'agent' || !ok) {
      throw unauthorized('Incorrect email or password');
    }
    const token = issueAgentToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

/** Returns the identity behind the current token (used by the client to restore a session). */
authRouter.get('/me', requireAuth, requireAgent, (req, res) => {
  const user = usersRepo.findById(req.auth!.subjectId);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const status = agentStatus.get(user.id) || 'online';
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, status } });
});

export const agentStatus = new Map<string, 'online' | 'busy' | 'away'>();

authRouter.post('/status', requireAuth, requireAgent, (req, res) => {
  const { status } = parseBody(z.object({ status: z.enum(['online', 'busy', 'away']) }), req.body);
  agentStatus.set(req.auth!.subjectId, status);
  res.json({ success: true, status });
});
