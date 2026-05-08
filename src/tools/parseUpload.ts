import { z } from 'zod';
import { tool, type Tool } from '../providers/llm.js';
import type { UploadSession } from '../uploads/session.js';

export const parseUploadDescription =
  'Parse a user-uploaded file (PDF or Excel) and return its content. Files ' +
  "are scoped to this turn only and are not part of Decade's conviction " +
  'corpus.';

export const parseUploadInputSchema = z.object({
  file_id: z.string(),
});

export type ParseUploadInput = z.infer<typeof parseUploadInputSchema>;

export type ParseUploadSuccess = { filename: string; content: string };
export type ParseUploadError = { error: string };
export type ParseUploadResult = ParseUploadSuccess | ParseUploadError;

/**
 * parse_upload is registered conditionally — only when a request carries
 * uploads. The tool factory binds the per-request UploadSession at
 * registration time so the agent can refer to upload file_ids by string.
 */
export function makeParseUploadTool(session: UploadSession): Tool {
  return tool({
    description: parseUploadDescription,
    parameters: parseUploadInputSchema,
    execute: async ({ file_id }): Promise<ParseUploadResult> => {
      const upload = session.get(file_id);
      if (!upload) return { error: `Upload ${file_id} not found.` };
      return { filename: upload.filename, content: upload.content };
    },
  });
}
