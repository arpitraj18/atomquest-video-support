import { Router } from 'express';
import { registry } from '../../metrics/metrics';

export const healthRouter = Router();

const startedAt = Date.now();

/** Liveness probe. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
});

/** Prometheus scrape endpoint. */
healthRouter.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
