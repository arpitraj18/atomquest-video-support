import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors';

/**
 * Parse and validate a request body against a schema, throwing a 400 with the first
 * readable message on failure. Returns the schema's *output* type, so fields with defaults
 * are correctly narrowed (e.g. an optional title becomes a definite string).
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join('.') ?? 'request';
    throw badRequest(`${field}: ${first?.message ?? 'is invalid'}`);
  }
  return result.data;
}
