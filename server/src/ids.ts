import { randomBytes, randomUUID } from 'node:crypto';

/** A URL-safe, collision-resistant identifier for database rows. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike chars (0/O, 1/I/L)

/**
 * A short, human-shareable invite code (e.g. "K7QP-2M9X"). Unguessable enough for an
 * invite link but easy to read aloud. The cryptographic gate on joining is the signed
 * invite token; this code is only the lookup handle.
 */
export function newInviteCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

/** ISO-8601 timestamp in UTC, used uniformly for every persisted time. */
export function now(): string {
  return new Date().toISOString();
}
