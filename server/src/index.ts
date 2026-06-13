import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './http/app';
import { attachSignaling } from './realtime/signaling';
import { initDatabase } from './db/database';
import { env } from './env';
import { logger } from './logger';

async function main(): Promise<void> {
  // Make sure storage directories exist before anything tries to write to them.
  mkdirSync(resolve(env.STORAGE_DIR, 'recordings'), { recursive: true });
  mkdirSync(resolve(env.STORAGE_DIR, 'files'), { recursive: true });

  initDatabase();

  const app = createApp();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    maxHttpBufferSize: 1e6,
  });
  attachSignaling(io);

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'AtomQuest video support server listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    io.close();
    httpServer.close(() => process.exit(0));
    // Force-exit if connections linger.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
