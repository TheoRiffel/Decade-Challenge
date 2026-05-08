import { z } from 'zod';
import { tool, type Tool } from '../providers/llm.js';
import type { UploadSession } from '../uploads/session.js';

export const parseUploadDescription =
  'Parse a user-uploaded file (PDF or Excel) and return its text content. ' +
  "Files are scoped to this turn only — they are not part of Decade's " +
  'conviction corpus. If the file was truncated, the content ends with a ' +
  'notice; request a more specific excerpt if needed.';

export const parseUploadInputSchema = z.object({
  file_id: z.string().describe('The file_id provided in the uploads system message.'),
});

export type ParseUploadInput = z.infer<typeof parseUploadInputSchema>;

export type ParseUploadSuccess = {
  filename: string;
  content: string;
  truncated: boolean;
};
export type ParseUploadError = { error: string };
export type ParseUploadResult = ParseUploadSuccess | ParseUploadError;

/**
 * parse_upload is registered conditionally — only when a request carries
 * uploads. The per-request UploadSession is bound at registration time.
 */
export function makeParseUploadTool(session: UploadSession): Tool {
  return tool({
    description: parseUploadDescription,
    parameters: parseUploadInputSchema,
    execute: async ({ file_id }): Promise<ParseUploadResult> => {
      const upload = session.get(file_id);
      if (!upload) {
        return { error: `No upload found for file_id "${file_id}". Available ids: ${session.list().map((u) => u.fileId).join(', ') || 'none'}.` };
      }
      return {
        filename: upload.filename,
        content: upload.content,
        truncated: upload.truncated,
      };
    },
  });
}
