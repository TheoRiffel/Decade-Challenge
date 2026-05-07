import type { Trace, TraceSnapshot, ValidationResult } from '../observability/trace.js';
import type { UploadSession } from '../uploads/session.js';

export type AgentMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AgentArgs = {
  messages: AgentMessage[];
  uploads?: UploadSession;
  trace: Trace;
};

export type AgentResult = {
  response: string;
  validation: ValidationResult;
  trace: TraceSnapshot;
};

/**
 * The single agentic orchestration entry point. Internally calls the AI SDK's
 * generateText with the tool map from tools/index.ts and stopWhen capped at
 * config.agent.maxSteps. After the loop finishes, runs the validation layer
 * (agent/validate.ts) and returns the final result + trace snapshot.
 *
 * Per ARCHITECTURE.md §6, this file is the ONLY permitted importer of
 * generateText/tools from the `ai` package outside providers/.
 */
export async function runAgent(_args: AgentArgs): Promise<AgentResult> {
  throw new Error('not implemented');
}
