import { logger } from '../logger';

interface PendingDisconnect {
  sessionId: string;
  timer: NodeJS.Timeout;
}

/**
 * Holds a participant's place for a short grace window after their connection drops.
 *
 *   - If they come back within the window, the pending expiry is cancelled and nobody else
 *     is told anything happened — a seamless reconnect.
 *   - If the window passes, the onExpire callback runs and they are treated as having left.
 *
 * A customer may drop and rejoin freely; the agent's session stays live throughout, which
 * is exactly the behaviour the brief asks for.
 */
export class ReconnectManager {
  private readonly pending = new Map<string, PendingDisconnect>();

  /** Begin the grace countdown for a participant who just dropped. */
  schedule(participantId: string, sessionId: string, graceSeconds: number, onExpire: () => void): void {
    this.cancel(participantId); // never stack timers for one participant
    const timer = setTimeout(() => {
      this.pending.delete(participantId);
      logger.info({ participantId, sessionId }, 'reconnect window expired; participant treated as left');
      onExpire();
    }, graceSeconds * 1000);
    this.pending.set(participantId, { sessionId, timer });
    logger.debug({ participantId, sessionId, graceSeconds }, 'reconnect window opened');
  }

  /** True if this participant is mid-grace-window (i.e. their return counts as a reconnect). */
  isPending(participantId: string): boolean {
    return this.pending.has(participantId);
  }

  /** Cancel a pending expiry. Returns true if one was actually pending. */
  cancel(participantId: string): boolean {
    const entry = this.pending.get(participantId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(participantId);
    return true;
  }
}

export const reconnectManager = new ReconnectManager();
