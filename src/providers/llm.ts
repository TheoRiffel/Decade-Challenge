import type { LanguageModel } from 'ai';

/**
 * Per ARCHITECTURE.md §8: providers expose AI SDK LanguageModel handles.
 * The agent loop in agent/loop.ts is the single permitted user of `ai`'s
 * generateText / tool primitives outside this layer.
 */
export interface LLMProvider {
  agentModel: LanguageModel;
  classifierModel: LanguageModel;
}
