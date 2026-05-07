import type { TraceSnapshot } from '../observability/trace.js';

export type GoldenCase = {
  id: string;
  query: string;
  expectedScope: 'in_scope' | 'out_of_scope' | 'borderline';
  expectedLanguage: 'pt' | 'en';
  expectedDocumentIds?: string[];
};

export type MetricResult = {
  name: string;
  passed: boolean;
  score?: number;
  notes?: string;
};

export async function faithfulness(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}

export async function scopeBehavior(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}

export async function sourcePrecision(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}

export async function disclaimerPresence(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}

export async function languageMatch(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}

export async function toolCallEfficiency(
  _trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  throw new Error('not implemented');
}
