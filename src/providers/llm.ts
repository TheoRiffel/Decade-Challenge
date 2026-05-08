import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * Re-exported so ingestion code can run text generations through the provider
 * boundary without importing from the `ai` package directly. Per
 * ARCHITECTURE.md §6, the only other permitted importer of `ai`'s
 * generation primitives is agent/loop.ts.
 */
export { generateText, tool } from 'ai';
export type { CoreMessage, Tool, ToolSet } from 'ai';

/**
 * Per ARCHITECTURE.md §8: providers expose AI SDK LanguageModel handles.
 * The agent loop in agent/loop.ts is the single permitted user of `ai`'s
 * generateText / tool primitives outside this layer.
 */
export interface LLMProvider {
  agentModel: LanguageModel;
  classifierModel: LanguageModel;
}

export type LLMModelIds = {
  agentModel: string;
  classifierModel: string;
};

export function anthropicLLM(models: LLMModelIds): LLMProvider {
  return {
    agentModel: anthropic(models.agentModel),
    classifierModel: anthropic(models.classifierModel),
  };
}

export function openaiLLM(models: LLMModelIds): LLMProvider {
  return {
    agentModel: openai(models.agentModel),
    classifierModel: openai(models.classifierModel),
  };
}
