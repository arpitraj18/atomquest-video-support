import { Router } from 'express';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { asyncHandler, forbidden, notFound } from '../errors';
import { requireAuth, requireAgent, requireSessionAccess } from '../../auth/guards';
import { recordingsRepo } from '../../db/repositories';
import { env } from '../../env';

// mergeParams lets this router read :sessionId from the mount path.
export const recordingsRouter = Router({ mergeParams: true });

const RECORDING_DIR = resolve(env.STORAGE_DIR, 'recordings');

// Recordings are sensitive support footage: agent-only, and only for sessions they own.
recordingsRouter.use(requireAuth, requireAgent, requireSessionAccess);

/** All recordings captured for a session, including their current status. */
recordingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ recordings: recordingsRepo.listBySession(req.params.sessionId) });
  }),
);

/** Status of a single recording (in progress / processing / ready / failed). */
recordingsRouter.get(
  '/:recordingId',
  asyncHandler(async (req, res) => {
    const recording = recordingsRepo.findById(req.params.recordingId);
    if (!recording || recording.sessionId !== req.params.sessionId) throw notFound('Recording not found');
    res.json({ recording });
  }),
);

/** Download the finished file. Opened directly by the browser with ?token=<agent token>. */
recordingsRouter.get(
  '/:recordingId/download',
  asyncHandler(async (req, res) => {
    const recording = recordingsRepo.findById(req.params.recordingId);
    if (!recording || recording.sessionId !== req.params.sessionId) throw notFound('Recording not found');
    if (recording.status !== 'ready' || !recording.storedName) {
      throw forbidden('This recording is not ready to download yet');
    }

    // storedName is server-generated (no user input), so it cannot escape the directory,
    // but we re-check containment as defence in depth.
    const filePath = join(RECORDING_DIR, recording.storedName);
    if (!filePath.startsWith(RECORDING_DIR) || !existsSync(filePath)) {
      throw notFound('Recording file is missing');
    }

    const niceName = `atomquest-recording-${recording.sessionId}.webm`;
    res.download(filePath, niceName);
  }),
);
