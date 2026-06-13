import bcrypt from 'bcryptjs';

const ROUNDS = 12;

/** Hashes a plaintext password for storage. Never store or log the plaintext. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Constant-time comparison of a candidate password against a stored hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
