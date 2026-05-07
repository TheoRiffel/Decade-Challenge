/**
 * Per ARCHITECTURE.md §16: every request gets a trace capturing each tool
 * call, its input/output, latency, validation, and final response. v1 logs
 * structured JSONL; v2 ships to Langfuse/Helicone.
 */

export type ToolCallRecord = {
  toolName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
};

export type AgentStepRecord = {
  stepIndex: number;
  toolCalls: ToolCallRecord[];
};

export type ValidationResult = {
  toolUseOk: boolean;
  sourceAttributionOk: boolean;
  disclaimerOk: boolean;
  languageMatchOk: boolean;
  warnings: string[];
};

export type TraceSnapshot = {
  requestId: string;
  startedAt: string;
  finishedAt: string;
  userMessage: string;
  detectedLanguage: 'pt' | 'en' | 'other' | null;
  steps: AgentStepRecord[];
  finalResponse: string;
  validation: ValidationResult | null;
  totals: {
    inputTokens: number;
    outputTokens: number;
  };
};

export interface Trace {
  readonly requestId: string;
  recordStep(step: { toolCalls: unknown[]; toolResults: unknown[] }): void;
  recordValidation(result: ValidationResult): void;
  recordTokens(usage: { inputTokens: number; outputTokens: number }): void;
  setDetectedLanguage(language: 'pt' | 'en' | 'other'): void;
  finish(finalResponse: string): TraceSnapshot;
}

export function createTrace(_args: {
  userMessage: string;
  requestId?: string;
}): Trace {
  throw new Error('not implemented');
}
