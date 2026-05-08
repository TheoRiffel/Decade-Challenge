import { generateText, type LLMProvider } from '../providers/llm.js';
import {
  CACHED_SYSTEM,
  documentBlock,
  SUMMARIZE_INSTRUCTION,
} from '../prompts/contextualize.js';

/**
 * Per ARCHITECTURE.md §13 step 3: a 1–2 sentence summary stored on
 * documents.summary, used by the list_documents tool.
 *
 * Uses the same shared system prompt and document-block prefix as
 * contextualizeChunk and marks the document with cache_control: ephemeral so
 * that calling summarize → contextualize × N for one doc only pays the full
 * doc-input cost once.
 */
export async function summarizeDocument(args: {
  llm: LLMProvider;
  documentMarkdown: string;
}): Promise<string> {
  const result = await generateText({
    model: args.llm.classifierModel,
    system: CACHED_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: documentBlock(args.documentMarkdown),
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
          { type: 'text', text: SUMMARIZE_INSTRUCTION },
        ],
      },
    ],
  });
  return result.text.trim();
}
