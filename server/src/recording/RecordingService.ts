import { MediaRecorder } from 'werift/nonstandard';
import { join, resolve } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';
import { env } from '../env';
import { logger } from '../logger';
import { recordingsRepo } from '../db/repositories';
import { mediaServer } from '../sfu/MediaServer';
import { now } from '../ids';
import { conflict, notFound } from '../http/errors';
import type { Recording } from '../types';

const RECORDING_DIR = resolve(env.STORAGE_DIR, 'recordings');

interface ActiveRecording {
  recordingId: string;
  recorder: MediaRecorder;
  filePath: string;
}

/**
 * Captures a session's live media to a WebM file on the server.
 *
 * werift's MediaRecorder muxes the participants' RTP straight to disk, so there is no
 * external transcoder to babysit. The track set is fixed when recording starts (the WebM
 * header declares its tracks up front), which is why the UI only offers "Start recording"
 * once the call is connected and both sides are publishing.
 *
 * Status lifecycle: recording → processing (while the file is finalised) → ready.
 */
class RecordingService {
  private readonly active = new Map<string, ActiveRecording>();

  isRecording(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  async start(sessionId: string): Promise<Recording> {
    if (this.active.has(sessionId)) {
      throw conflict('A recording is already in progress for this session');
    }

    mkdirSync(RECORDING_DIR, { recursive: true });
    const tracks = mediaServer.getSessionTracks(sessionId);

    const recording = recordingsRepo.create({ sessionId, mimeType: 'video/webm' });
    const filePath = join(RECORDING_DIR, `${recording.id}.webm`);

    const recorder = new MediaRecorder({
      path: filePath,
      numOfTracks: Math.max(tracks.length, 1),
      tracks,
      disableLipSync: true,
    });
    recorder.onError.subscribe((err) => {
      logger.error({ err, sessionId, recordingId: recording.id }, 'recorder error');
      recordingsRepo.update(recording.id, { status: 'failed', endedAt: now() });
      this.active.delete(sessionId);
    });

    this.active.set(sessionId, { recordingId: recording.id, recorder, filePath });
    logger.info({ sessionId, recordingId: recording.id, trackCount: tracks.length }, 'recording started');

    // Nudge the peers to send a keyframe so the WebM starts cleanly with video.
    setTimeout(() => mediaServer.requestKeyframes(sessionId), 100);
    setTimeout(() => mediaServer.requestKeyframes(sessionId), 500);

    return recording;
  }

  async stop(sessionId: string): Promise<Recording> {
    const entry = this.active.get(sessionId);
    if (!entry) throw notFound('No active recording for this session');

    this.active.delete(sessionId);
    recordingsRepo.update(entry.recordingId, { status: 'processing' });

    try {
      await entry.recorder.stop();
      const sizeBytes = statSync(entry.filePath).size;
      recordingsRepo.update(entry.recordingId, {
        status: 'ready',
        storedName: `${entry.recordingId}.webm`,
        sizeBytes,
        endedAt: now(),
      });
      logger.info({ sessionId, recordingId: entry.recordingId, sizeBytes }, 'recording ready');
    } catch (err) {
      logger.error({ err, sessionId }, 'failed to finalise recording');
      recordingsRepo.update(entry.recordingId, { status: 'failed', endedAt: now() });
    }

    const finalRecording = recordingsRepo.findById(entry.recordingId);
    if (!finalRecording) throw notFound('Recording disappeared after finalisation');
    return finalRecording;
  }

  /** Best-effort stop used when a session ends while still recording. */
  async stopIfActive(sessionId: string): Promise<Recording | null> {
    if (!this.active.has(sessionId)) return null;
    return this.stop(sessionId);
  }
}

export const recordingService = new RecordingService();
