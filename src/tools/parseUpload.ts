import { z } from 'zod';
import type { UploadSession } from '../uploads/session.js';

export const parseUploadDescription =
  'Parse a user-uploaded file (PDF or Excel) and return its content. Files ' +
  'are scoped to this turn only and are not part of Decade\'s conviction ' +
  'corpus.';

export const parseUploadInputSchema = z.object({
  file_id: z.string(),
});

export type ParseUploadInput = z.infer<typeof parseUploadInputSchema>;

export type ParseUploadSuccess = { filename: string; content: string };
export type ParseUploadError = { error: string };
export type ParseUploadResult = ParseUploadSuccess | ParseUploadError;

export async function executeParseUpload(
  _input: ParseUploadInput,
  _session: UploadSession,
): Promise<ParseUploadResult> {
  throw new Error('not implemented');
}
