import type { LLMProvider } from '../providers/llm.js';
import type { ParsedChunk } from './parse.js';

export type ContextualizeArgs = {
  llm: LLMProvider;
  documentMarkdown: string;
  chunk: ParsedChunk;
};

export async function contextualizeChunk(
  _args: ContextualizeArgs,
): Promise<string> {
  throw new Error('not implemented');
}
