import type { NextFunction, Request, Response } from 'express';
import { verifyAnyToken } from './tokens';
import { forbidden, unauthorized } from '../http/errors';
import { sessionsRepo } from '../db/repositories';
import type { AuthContext } from '../types';

// Attach the verified identity to the request object in a typed way.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  // Allow token via query only for the recording download link, which a browser opens directly.
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

/** Rejects the request unless it carries a valid agent or invite token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  const auth = verifyAnyToken(token);
  if (!auth) return next(unauthorized('Invalid or expired token'));
  req.auth = auth;
  next();
}

/** Rejects the request unless the caller is an authenticated agent. */
export function requireAgent(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'agent') return next(forbidden('This action is restricted to support agents'));
  next();
}

/**
 * Enforces that the caller may act on the `:sessionId` in the route:
 *   - an agent may only touch sessions they own;
 *   - a customer may only touch the single session their invite is scoped to.
 * Run this after requireAuth on every session-scoped route.
 */
export function requireSessionAccess(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) return next(unauthorized());

  const sessionId = req.params.sessionId;
  if (!sessionId) return next(forbidden('No session specified'));

  if (auth.role === 'customer') {
    if (auth.sessionId !== sessionId) return next(forbidden('Your invite is not valid for this session'));
    return next();
  }

  // agent: must own the session
  const session = sessionsRepo.findById(sessionId);
  if (!session) return next(forbidden('Session not found'));
  if (session.agentId !== auth.subjectId) return next(forbidden('You do not own this session'));
  next();
}
