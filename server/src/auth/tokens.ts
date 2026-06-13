import jwt from 'jsonwebtoken';
import { env } from '../env';
import type { AuthContext, Role, User } from '../types';

/**
 * Two distinct token families, signed with two distinct secrets:
 *
 *  - Agent session tokens prove "this is a logged-in agent" and grant agent powers.
 *  - Invite tokens prove "the bearer was invited to exactly this session as a customer".
 *    They carry the session id and cannot be used anywhere else.
 *
 * Splitting the secrets means a leaked invite token can never be escalated into an
 * agent token, and vice versa.
 */

interface AgentTokenClaims {
  kind: 'agent';
  sub: string; // user id
  name: string;
  role: Role;
}

interface InviteTokenClaims {
  kind: 'invite';
  sub: string; // a per-invite identifier, not a user account
  name: string;
  sid: string; // session id this invite is bound to
  role: 'customer';
}

export function issueAgentToken(user: User): string {
  const claims: AgentTokenClaims = { kind: 'agent', sub: user.id, name: user.name, role: 'agent' };
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: env.SESSION_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
}

export function issueInviteToken(input: { sessionId: string; displayName: string; inviteId: string }): string {
  const claims: InviteTokenClaims = {
    kind: 'invite',
    sub: input.inviteId,
    name: input.displayName,
    sid: input.sessionId,
    role: 'customer',
  };
  return jwt.sign(claims, env.INVITE_SECRET, { expiresIn: env.INVITE_TOKEN_TTL as jwt.SignOptions['expiresIn'] });
}

/** Verifies an agent session token, returning a normalised auth context or null. */
export function verifyAgentToken(token: string): AuthContext | null {
  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as AgentTokenClaims;
    if (claims.kind !== 'agent') return null;
    return { role: 'agent', subjectId: claims.sub, displayName: claims.name };
  } catch {
    return null;
  }
}

/** Verifies a customer invite token, returning a context scoped to one session, or null. */
export function verifyInviteToken(token: string): AuthContext | null {
  try {
    const claims = jwt.verify(token, env.INVITE_SECRET) as InviteTokenClaims;
    if (claims.kind !== 'invite') return null;
    return { role: 'customer', subjectId: claims.sub, displayName: claims.name, sessionId: claims.sid };
  } catch {
    return null;
  }
}

/**
 * Accepts either token family. Used by endpoints and sockets that both roles may reach
 * (the access check for the specific resource happens separately in the guards).
 */
export function verifyAnyToken(token: string): AuthContext | null {
  return verifyAgentToken(token) ?? verifyInviteToken(token);
}
