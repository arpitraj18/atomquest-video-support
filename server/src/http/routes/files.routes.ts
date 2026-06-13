import { Router } from 'express';
import multer from 'multer';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { asyncHandler, badRequest, notFound } from '../errors';
import { requireAuth, requireSessionAccess } from '../../auth/guards';
import { filesRepo } from '../../db/repositories';
import { newId } from '../../ids';
import { env } from '../../env';

export const filesRouter = Router({ mergeParams: true });

const FILE_DIR = resolve(env.STORAGE_DIR, 'files');
mkdirSync(FILE_DIR, { recursive: true });

/**
 * Allowlist of accepted types mapped to the extension we will store them under. The stored
 * extension is derived from the (browser-reported) MIME type, never from the user's
 * filename, so a malicious name can neither pick the extension nor traverse the filesystem.
 */
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILE_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED[file.mimetype] ?? 'bin';
    cb(null, `${newId('fil')}.${ext}`); // generated name only
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new Error('UNSUPPORTED_FILE_TYPE'));
  },
});

// Both participants in a session may share and view files; nobody outside it can.
filesRouter.use(requireAuth, requireSessionAccess);

/** Upload one file. The client then posts its id into chat over the socket. */
filesRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file was uploaded');
    const uploaderName = req.auth!.displayName;
    const record = filesRepo.add({
      sessionId: req.params.sessionId,
      uploaderName,
      originalName: req.file.originalname.slice(0, 200),
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });
    res.status(201).json({
      file: {
        id: record.id,
        name: record.originalName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
      },
    });
  }),
);

/** Download / preview a shared file. Opened by the browser with ?token=<token>. */
filesRouter.get(
  '/:fileId',
  asyncHandler(async (req, res) => {
    const file = filesRepo.findById(req.params.fileId);
    if (!file || file.sessionId !== req.params.sessionId) throw notFound('File not found');

    const filePath = join(FILE_DIR, file.storedName);
    if (!filePath.startsWith(FILE_DIR) || !existsSync(filePath)) throw notFound('File is missing');

    res.setHeader('Content-Type', file.mimeType);
    // Images preview inline; everything else downloads. Quote the name to neutralise it.
    const disposition = file.mimeType.startsWith('image/') ? 'inline' : 'attachment';
    const safeName = file.originalName.replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.sendFile(filePath);
  }),
);
