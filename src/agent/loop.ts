import { config, llm } from '../config.js';
import { detectLanguage } from '../lib/language.js';
import {
  generateText,
  type CoreMessage,
} from '../providers/llm.js';
import type { Trace, TraceSnapshot, ValidationResult } from '../observability/trace.js';
import { buildTools } from '../tools/index.js';
import type { UploadSession } from '../uploads/session.js';
import { agentSystemPrompt } from './systemPrompt.js';
import { validateAndFinalize } from './validate.js';

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
 * The single agentic orchestration entry point (ARCHITECTURE.md §9).
 *
 * generateText drives the tool-loop; we cap iterations with maxSteps. Each
 * step's tool calls + results are fed to trace.recordStep via onStepFinish.
 * After the loop, validateAndFinalize runs the §12 post-checks.
 *
 * Per ARCHITECTURE.md §6, this file is the ONLY permitted importer of
 * generateText / tools from the `ai` package outside providers/. The arch's
 * stopWhen + stepCountIs idiom is AI SDK v5+; on v4.3 we use maxSteps
 * (semantically equivalent — same hard cap on iterations).
 */
export async function runAgent(args: AgentArgs): Promise<AgentResult> {
  const { messages, uploads, trace } = args;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userMessage = lastUserMessage?.content ?? '';
  trace.setDetectedLanguage(detectLanguage(userMessage));

  const tools = buildTools(uploads ? { trace, uploads } : { trace });
  const system = agentSystemPrompt({ hasUploads: uploads !== undefined });

  const conversationMessages: CoreMessage[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const result = await generateText({
    model: llm.agentModel,
    system,
    messages: conversationMessages,
    tools,
    maxSteps: config.agent.maxSteps,
    onStepFinish: (step) => {
      trace.recordStep({
        toolCalls: step.toolCalls as unknown[],
        toolResults: step.toolResults as unknown[],
      });
    },
  });

  trace.recordTokens({
    inputTokens: result.usage.promptTokens,
    outputTokens: result.usage.completionTokens,
  });

  const { response, validation } = validateAndFinalize({
    trace,
    response: result.text,
    userMessage,
  });
  trace.recordValidation(validation);

  const snapshot = trace.finish(response);
  return { response, validation, trace: snapshot };
}
