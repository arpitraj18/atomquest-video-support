import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { mediaServer } from '../sfu/MediaServer';
import { sessionsRepo } from '../db/repositories';

/**
 * Operational metrics in Prometheus exposition format, served at GET /metrics.
 *
 * Gauges are sampled on scrape from the live SFU and database, so they always reflect the
 * current moment. Counters are incremented from the places where the events happen
 * (signaling, routes). A standard Prometheus server can scrape this directly; the README
 * includes an example scrape config and the matching Grafana-friendly metric names.
 */
export const registry = new Registry();
registry.setDefaultLabels({ app: 'atomquest_video_support' });
collectDefaultMetrics({ register: registry });

/* ─── live gauges (computed on scrape) ─── */

new Gauge({
  name: 'atomquest_active_sessions',
  help: 'Sessions currently live (a call is in progress)',
  registers: [registry],
  collect() {
    this.set(sessionsRepo.listLive().length);
  },
});

new Gauge({
  name: 'atomquest_connected_participants',
  help: 'Participants with an established media connection across all sessions',
  registers: [registry],
  collect() {
    this.set(mediaServer.peerCount);
  },
});

new Gauge({
  name: 'atomquest_active_media_rooms',
  help: 'SFU rooms that currently hold at least one peer',
  registers: [registry],
  collect() {
    this.set(mediaServer.roomCount);
  },
});

/* ─── counters (incremented at the event source) ─── */

export const metrics = {
  sessionsCreated: new Counter({
    name: 'atomquest_sessions_created_total',
    help: 'Total sessions created by agents',
    registers: [registry],
  }),
  callsEnded: new Counter({
    name: 'atomquest_calls_ended_total',
    help: 'Total sessions ended',
    labelNames: ['ended_by'] as const,
    registers: [registry],
  }),
  chatMessages: new Counter({
    name: 'atomquest_chat_messages_total',
    help: 'Total chat messages sent during calls',
    registers: [registry],
  }),
  filesShared: new Counter({
    name: 'atomquest_files_shared_total',
    help: 'Total files shared in chat',
    registers: [registry],
  }),
  reconnections: new Counter({
    name: 'atomquest_reconnections_total',
    help: 'Total successful reconnections within the grace window',
    registers: [registry],
  }),
  errors: new Counter({
    name: 'atomquest_errors_total',
    help: 'Total handled errors, by area',
    labelNames: ['area'] as const,
    registers: [registry],
  }),
};
