import pino from 'pino';
import { env } from './env';

/**
 * A single structured logger for the whole process. In development it pretty-prints;
 * in production it emits newline-delimited JSON suitable for log shippers.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined, // drop pid/hostname noise from every line
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
});

export type Logger = typeof logger;
