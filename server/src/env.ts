import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated configuration. Importing this module fails fast with a
 * readable message if a required variable is missing or malformed, so the server
 * never starts in a half-configured state.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  INVITE_SECRET: z.string().min(16, 'INVITE_SECRET must be at least 16 characters'),
  SESSION_TOKEN_TTL: z.string().default('12h'),
  INVITE_TOKEN_TTL: z.string().default('4h'),

  ANNOUNCED_IP: z.string().default(''),
  STUN_URL: z.string().default('stun:stun.l.google.com:19302'),

  DATABASE_PATH: z.string().default('./data/atomquest.db'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),

  RECONNECT_GRACE_SECONDS: z.coerce.number().int().positive().default(20),

  SEED_AGENT_EMAIL: z.string().email().default('agent@atomquest.dev'),
  SEED_AGENT_PASSWORD: z.string().min(6).default('Demo!Agent1'),
  SEED_AGENT_NAME: z.string().default('Riya Sharma'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

const corsOrigins = (raw.CORS_ORIGINS || raw.WEB_ORIGIN)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  corsOrigins,
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
} as const;

/**
 * Guard against shipping the placeholder secrets to production.
 */
if (env.isProduction) {
  const weak = [env.JWT_SECRET, env.INVITE_SECRET].some((s) => s.includes('change-me'));
  if (weak) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production with default placeholder secrets. Set JWT_SECRET and INVITE_SECRET.');
    process.exit(1);
  }
}
