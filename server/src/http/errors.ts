import type { NextFunction, Request, Response } from 'express';

/** An error carrying an HTTP status code and a client-safe message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'error',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');

/**
 * Wraps an async route handler so rejected promises reach the error middleware
 * instead of crashing the process or hanging the request.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
