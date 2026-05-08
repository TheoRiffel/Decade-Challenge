import { generateText, type LLMProvider } from '../providers/llm.js';
import {
  CACHED_SYSTEM,
  contextualizeInstruction,
  documentBlock,
} from '../prompts/contextualize.js';
import type { ParsedChunk } from './parse.js';

export type ContextualizeArgs = {
  llm: LLMProvider;
  documentMarkdown: string;
  chunk: ParsedChunk;
};

/**
 * Returns the chunk text prepended with a 1–2 sentence situating context.
 * Shares CACHED_SYSTEM + documentBlock with summarizeDocument so the parent
 * document is cached once per ingest run (ARCHITECTURE.md §13.5).
 */
export async function contextualizeChunk(
  args: ContextualizeArgs,
): Promise<string> {
  const { llm, documentMarkdown, chunk } = args;
  const result = await generateText({
    model: llm.classifierModel,
    system: CACHED_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: documentBlock(documentMarkdown),
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
          {
            type: 'text',
            text: contextualizeInstruction(chunk.content),
          },
        ],
      },
    ],
  });
  const context = result.text.trim();
  return context.length > 0 ? `${context}\n\n${chunk.content}` : chunk.content;
}
