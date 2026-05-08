import { randomUUID } from 'node:crypto';

/**
 * Per ARCHITECTURE.md §16: every request gets a trace capturing each tool
 * call, its input/output, latency, validation, and final response. v1 is
 * in-memory; step 8 (observability) ships JSONL to disk and/or Langfuse.
 */

export type FileParseRecord = {
  filename: string;
  mimeType: string;
  parser: 'local' | 'anthropic';
  latencyMs: number;
  truncated: boolean;
  pageCount?: number;
  sheetCount?: number;
};

export type ToolCallRecord = {
  toolName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
};

export type AgentStepRecord = {
  stepIndex: number;
  toolCalls: ToolCallRecord[];
  latencyMs: number;
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
  fileParses: FileParseRecord[];
  steps: AgentStepRecord[];
  finalResponse: string;
  validation: ValidationResult | null;
  totals: {
    inputTokens: number;
    outputTokens: number;
  };
};

type RawStep = {
  toolCalls: unknown[];
  toolResults: unknown[];
};

export interface Trace {
  readonly requestId: string;
  recordFileParse(record: FileParseRecord): void;
  recordStep(step: RawStep): void;
  recordValidation(result: ValidationResult): void;
  recordTokens(usage: { inputTokens: number; outputTokens: number }): void;
  setDetectedLanguage(language: 'pt' | 'en' | 'other'): void;
  /** Read-only view of accumulated steps. Used by validation. */
  getSteps(): readonly AgentStepRecord[];
  finish(finalResponse: string): TraceSnapshot;
}

class TraceImpl implements Trace {
  readonly requestId: string;
  private readonly userMessage: string;
  private readonly startedAt: string;
  private readonly fileParses: FileParseRecord[] = [];
  private readonly steps: AgentStepRecord[] = [];
  private detectedLanguage: 'pt' | 'en' | 'other' | null = null;
  private validation: ValidationResult | null = null;
  private totals = { inputTokens: 0, outputTokens: 0 };
  private lastStepStartMs: number;

  constructor(args: { userMessage: string; requestId?: string }) {
    this.requestId = args.requestId ?? randomUUID();
    this.userMessage = args.userMessage;
    this.startedAt = new Date().toISOString();
    this.lastStepStartMs = performance.now();
  }

  recordFileParse(record: FileParseRecord): void {
    this.fileParses.push(record);
  }

  recordStep(step: RawStep): void {
    const now = performance.now();
    const latencyMs = Math.round(now - this.lastStepStartMs);
    this.lastStepStartMs = now;

    const resultsByCallId = new Map<string, unknown>();
    for (const r of step.toolResults) {
      if (!isObject(r)) continue;
      const id = r['toolCallId'];
      if (typeof id === 'string') resultsByCallId.set(id, r['result']);
    }

    const toolCalls: ToolCallRecord[] = [];
    for (const c of step.toolCalls) {
      if (!isObject(c)) continue;
      const toolName = typeof c['toolName'] === 'string' ? c['toolName'] : 'unknown';
      const id = typeof c['toolCallId'] === 'string' ? c['toolCallId'] : null;
      toolCalls.push({
        toolName,
        input: c['args'],
        output: id !== null ? resultsByCallId.get(id) ?? null : null,
        latencyMs: 0,
      });
    }

    this.steps.push({
      stepIndex: this.steps.length,
      toolCalls,
      latencyMs,
    });
  }

  recordValidation(result: ValidationResult): void {
    this.validation = result;
  }

  recordTokens(usage: { inputTokens: number; outputTokens: number }): void {
    this.totals.inputTokens += usage.inputTokens;
    this.totals.outputTokens += usage.outputTokens;
  }

  setDetectedLanguage(language: 'pt' | 'en' | 'other'): void {
    this.detectedLanguage = language;
  }

  getSteps(): readonly AgentStepRecord[] {
    return this.steps;
  }

  finish(finalResponse: string): TraceSnapshot {
    return {
      requestId: this.requestId,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      userMessage: this.userMessage,
      detectedLanguage: this.detectedLanguage,
      fileParses: [...this.fileParses],
      steps: this.steps.map((s) => ({
        stepIndex: s.stepIndex,
        toolCalls: s.toolCalls.map((c) => ({ ...c })),
        latencyMs: s.latencyMs,
      })),
      finalResponse,
      validation: this.validation,
      totals: { ...this.totals },
    };
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function createTrace(args: {
  userMessage: string;
  requestId?: string;
}): Trace {
  return new TraceImpl(args);
}
