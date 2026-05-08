import { ilike, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { documents } from '../db/schema.js';
import { tool } from '../providers/llm.js';

export const listDocumentsDescription =
  'List all available conviction documents with their titles and one-line ' +
  'summaries. Use to orient yourself on what topics Decade has convictions ' +
  'about, especially when you suspect a topic may be out of scope.';

export const listDocumentsInputSchema = z.object({
  topic_filter: z
    .string()
    .optional()
    .describe('Optional keyword filter applied to titles and summaries.'),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;

export type ListDocumentsEntry = {
  id: string;
  title: string | null;
  language: string;
  summary: string | null;
};

export const listDocumentsTool = tool({
  description: listDocumentsDescription,
  parameters: listDocumentsInputSchema,
  execute: async ({ topic_filter }): Promise<ListDocumentsEntry[]> => {
    const where: SQL | undefined =
      topic_filter && topic_filter.trim().length > 0
        ? or(
            ilike(documents.title, `%${topic_filter}%`),
            ilike(documents.summary, `%${topic_filter}%`),
          )
        : undefined;

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        language: documents.language,
        summary: documents.summary,
      })
      .from(documents)
      .where(where)
      .orderBy(documents.id);

    return rows;
  },
});
