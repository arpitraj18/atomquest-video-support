import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { MulterError } from 'multer';
import { pinoHttp } from 'pino-http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { authRouter } from './routes/auth.routes';
import { sessionsRouter } from './routes/sessions.routes';
import { invitesRouter } from './routes/invites.routes';
import { recordingsRouter } from './routes/recordings.routes';
import { filesRouter } from './routes/files.routes';
import { adminRouter } from './routes/admin.routes';
import { healthRouter } from './routes/health.routes';
import { HttpError } from './errors';
import { env } from '../env';
import { logger } from '../logger';
import { metrics } from '../metrics/metrics';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind a proxy (rate limiting, logs)

  // Security headers. Files and recordings are fetched from the separate web origin, so
  // resources must be allowed cross-origin. CSP is left to the static host / Vite.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' } }));

  // Health and metrics at the root.
  app.use('/', healthRouter);

  // API. The recording and file routers are mounted on their session sub-paths and read
  // :sessionId via mergeParams.
  app.use('/api/auth', authRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/sessions/:sessionId/recordings', recordingsRouter);
  app.use('/api/sessions/:sessionId/files', filesRouter);
  app.use('/api/sessions', sessionsRouter);

  // Optionally serve the built frontend in production (single-origin deployment).
  const webDist = resolve(__dirname, '../../../web/dist');
  if (env.isProduction && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/metrics' || req.path === '/health') return next();
      res.sendFile(resolve(webDist, 'index.html'));
    });
  }

  // 404 for anything unmatched under the API.
  app.use((req, res, next) => {
    if (res.headersSent) return next();
    res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
  });

  // Central error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is larger than the ${env.MAX_UPLOAD_MB}MB limit`
          : 'Upload failed. Please try a different file.';
      res.status(400).json({ error: 'upload_error', message });
      return;
    }
    if (err instanceof Error && err.message === 'UNSUPPORTED_FILE_TYPE') {
      res.status(400).json({
        error: 'unsupported_file_type',
        message: 'That file type is not allowed. Share an image, PDF, or common document.',
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    metrics.errors.inc({ area: 'http' });
    logger.error({ err, path: req.path }, 'unhandled request error');
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on our end.' });
  });

  return app;
}
