import { config, llm } from '../config.js';
import { detectLanguage } from '../lib/language.js';
import {
  streamText,
  type CoreMessage,
} from '../providers/llm.js';
import type { Trace, TraceSnapshot } from '../observability/trace.js';
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
  /** Called after the stream ends with the finalised, validated trace snapshot. */
  onDone?: (snapshot: TraceSnapshot) => Promise<void> | void;
};

/**
 * The single agentic orchestration entry point (ARCHITECTURE.md §9).
 *
 * streamText drives the tool-loop; we cap iterations with maxSteps. Each
 * step's tool calls + results are recorded to trace via onStepFinish.
 * After the loop ends, onFinish runs validateAndFinalize (§12), closes
 * the trace, and calls onDone so the caller can write the snapshot to its
 * sink without this module knowing about the sink.
 *
 * Per ARCHITECTURE.md §6, this file is the ONLY permitted importer of
 * streamText / tools from the `ai` package outside providers/.
 */
export function runAgent(args: AgentArgs) {
  const { messages, uploads, trace, onDone } = args;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userMessage = lastUserMessage?.content ?? '';
  trace.setDetectedLanguage(detectLanguage(userMessage));

  const tools = buildTools(uploads ? { trace, uploads } : { trace });
  const uploadedFiles = uploads?.list().map((u) => ({
    fileId: u.fileId,
    filename: u.filename,
    mimeType: u.mimeType,
    truncated: u.truncated,
  }));
  const system = agentSystemPrompt(
    uploadedFiles ? { uploadedFiles } : {},
  );

  // Filter out messages with empty content: useChat@1.x keeps partially-
  // streamed assistant messages (content:"") in state when a response errors
  // mid-stream. Passing them to the LLM causes an Anthropic API 400.
  const conversationMessages: CoreMessage[] = messages
    .filter((m) => m.role !== 'system' && m.content.trim() !== '')
    .map((m) => ({ role: m.role, content: m.content }));

  return streamText({
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
    onFinish: async ({ text, usage }) => {
      trace.recordTokens({
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      });
      const { response, validation } = validateAndFinalize({ trace, response: text, userMessage });
      trace.recordValidation(validation);
      const snapshot = trace.finish(response);
      await onDone?.(snapshot);
    },
  });
}
