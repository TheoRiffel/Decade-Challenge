import { llm } from '../config.js';
import { detectLanguage } from '../lib/language.js';
import type { TraceSnapshot } from '../observability/trace.js';
import { generateText } from '../providers/llm.js';

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

const DISCLAIMER_MARK = '⚠️';
const SOURCES_RE = /^Sources:\s*(.+)$/m;
const FAITHFULNESS_PASS_THRESHOLD = 0.8;
const EVIDENCE_CHAR_CAP = 30_000;

const FAITHFULNESS_SYSTEM = `You judge whether a response's factual claims are supported by the provided evidence excerpts. A claim is "supported" if the evidence reasonably implies it. A claim is "unsupported" if it adds specific facts (numbers, names, rules, dates) not in the evidence.

Output strict JSON only, on one line, no markdown fences:
{"score": <0.0-1.0>, "rationale": "<one-sentence reason>", "unsupported_claims": ["..."]}`;

/**
 * LLM-as-judge faithfulness — the single most important metric per
 * ARCHITECTURE.md §17. Skipped for out_of_scope cases (the answer is
 * intentionally from general knowledge, not Decade).
 */
export async function faithfulness(
  trace: TraceSnapshot,
  expected: GoldenCase,
): Promise<MetricResult> {
  if (expected.expectedScope === 'out_of_scope') {
    return {
      name: 'faithfulness',
      passed: true,
      notes: 'n/a (out_of_scope; answer is from general knowledge)',
    };
  }

  const evidence = collectEvidence(trace).slice(0, EVIDENCE_CHAR_CAP);
  if (evidence.length === 0) {
    return {
      name: 'faithfulness',
      passed: false,
      score: 0,
      notes: 'no evidence retrieved (no search_convictions/read_document outputs)',
    };
  }

  try {
    const result = await generateText({
      model: llm.classifierModel,
      system: FAITHFULNESS_SYSTEM,
      prompt: `Evidence:\n${evidence}\n\nResponse:\n${trace.finalResponse}\n\nOutput JSON only.`,
    });
    const parsed = parseJudgeJson(result.text);
    if (parsed === null) {
      return {
        name: 'faithfulness',
        passed: false,
        notes: `judge returned unparseable output: ${result.text.slice(0, 200)}`,
      };
    }
    return {
      name: 'faithfulness',
      passed: parsed.score >= FAITHFULNESS_PASS_THRESHOLD,
      score: parsed.score,
      notes: parsed.rationale,
    };
  } catch (err) {
    return {
      name: 'faithfulness',
      passed: false,
      notes: `judge error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Scope behavior — did the agent retrieve / cite / disclaim appropriately
 * for the expected scope?
 */
export async function scopeBehavior(
  trace: TraceSnapshot,
  expected: GoldenCase,
): Promise<MetricResult> {
  const hasSearch = trace.steps.some((s) =>
    s.toolCalls.some((c) => c.toolName === 'search_convictions'),
  );
  const hasDisclaimer = trace.finalResponse.includes(DISCLAIMER_MARK);
  const hasSources = SOURCES_RE.test(trace.finalResponse);

  if (expected.expectedScope === 'in_scope') {
    const passed = hasSearch && hasSources && !hasDisclaimer;
    return {
      name: 'scope_behavior',
      passed,
      notes: `search=${hasSearch}, sources=${hasSources}, no_disclaimer=${!hasDisclaimer}`,
    };
  }
  if (expected.expectedScope === 'out_of_scope') {
    const passed = hasDisclaimer && !hasSources;
    return {
      name: 'scope_behavior',
      passed,
      notes: `disclaimer=${hasDisclaimer}, no_sources=${!hasSources}`,
    };
  }
  const passed = hasSearch && hasDisclaimer;
  return {
    name: 'scope_behavior',
    passed,
    notes: `borderline: search=${hasSearch}, disclaimer=${hasDisclaimer}, sources=${hasSources}`,
  };
}

/**
 * Source precision — fraction of cited document IDs that were actually
 * returned by some tool call. Validation already strips hallucinations
 * before this runs, so a passing eval here usually means validation didn't
 * have to intervene.
 */
export async function sourcePrecision(
  trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  const cited = parseSources(trace.finalResponse);
  if (cited.length === 0) {
    return {
      name: 'source_precision',
      passed: true,
      notes: 'no Sources footer to evaluate',
    };
  }
  const returned = collectReturnedDocIds(trace);
  const matched = cited.filter((id) => returned.has(id));
  const score = matched.length / cited.length;
  return {
    name: 'source_precision',
    passed: score === 1,
    score,
    notes: `${matched.length}/${cited.length} cited IDs were retrieved`,
  };
}

export async function disclaimerPresence(
  trace: TraceSnapshot,
  expected: GoldenCase,
): Promise<MetricResult> {
  const present = trace.finalResponse.includes(DISCLAIMER_MARK);
  if (expected.expectedScope === 'out_of_scope') {
    return {
      name: 'disclaimer_presence',
      passed: present,
      notes: present ? 'present (correct)' : 'expected disclaimer; missing',
    };
  }
  if (expected.expectedScope === 'borderline') {
    return {
      name: 'disclaimer_presence',
      passed: present,
      notes: present ? 'present (correct for borderline)' : 'expected partial-coverage disclaimer; missing',
    };
  }
  return {
    name: 'disclaimer_presence',
    passed: !present,
    notes: present
      ? 'unexpected disclaimer on in_scope answer'
      : 'absent (correct for in_scope)',
  };
}

export async function languageMatch(
  trace: TraceSnapshot,
  expected: GoldenCase,
): Promise<MetricResult> {
  const detected = detectLanguage(trace.finalResponse);
  const passed = detected === expected.expectedLanguage || detected === 'other';
  return {
    name: 'language_match',
    passed,
    notes: `detected=${detected}, expected=${expected.expectedLanguage}`,
  };
}

/**
 * Tool-call efficiency — heuristic: ≤3 calls = ideal (1.0), 4–6 acceptable
 * (decaying), >6 = thrashing (sub-1.0 score, fails). Step cap is 10 in
 * config, so >6 means the agent is iterating without converging.
 */
export async function toolCallEfficiency(
  trace: TraceSnapshot,
  _expected: GoldenCase,
): Promise<MetricResult> {
  const totalCalls = trace.steps.reduce(
    (acc, s) => acc + s.toolCalls.length,
    0,
  );
  let score = 1.0;
  if (totalCalls === 0) {
    score = 1.0;
  } else if (totalCalls > 6) {
    score = Math.max(0.1, 6 / totalCalls);
  } else if (totalCalls > 3) {
    score = 1 - (totalCalls - 3) * 0.1;
  }
  return {
    name: 'tool_call_efficiency',
    passed: totalCalls <= 6,
    score,
    notes: `${totalCalls} tool call(s)`,
  };
}

function collectEvidence(trace: TraceSnapshot): string {
  const parts: string[] = [];
  for (const step of trace.steps) {
    for (const call of step.toolCalls) {
      if (call.toolName === 'search_convictions' && Array.isArray(call.output)) {
        for (const hit of call.output) {
          if (hit !== null && typeof hit === 'object') {
            const o = hit as Record<string, unknown>;
            const docId = o['document_id'];
            const content = o['content'];
            if (typeof docId === 'string' && typeof content === 'string') {
              parts.push(`[doc=${docId}]\n${content}`);
            }
          }
        }
      } else if (
        call.toolName === 'read_document' &&
        call.output !== null &&
        typeof call.output === 'object'
      ) {
        const o = call.output as Record<string, unknown>;
        if (typeof o['id'] === 'string' && typeof o['content'] === 'string') {
          parts.push(`[doc=${o['id']}]\n${o['content']}`);
        }
      }
    }
  }
  return parts.join('\n\n---\n\n');
}

function parseJudgeJson(
  text: string,
): { score: number; rationale: string; unsupported_claims: string[] } | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(stripped) as unknown;
    if (typeof obj !== 'object' || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (typeof o['score'] !== 'number') return null;
    return {
      score: Math.max(0, Math.min(1, o['score'])),
      rationale: typeof o['rationale'] === 'string' ? o['rationale'] : '',
      unsupported_claims: Array.isArray(o['unsupported_claims'])
        ? o['unsupported_claims'].filter((c): c is string => typeof c === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function parseSources(response: string): string[] {
  const m = SOURCES_RE.exec(response);
  if (!m || m[1] === undefined) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function collectReturnedDocIds(trace: TraceSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const step of trace.steps) {
    for (const call of step.toolCalls) {
      collectFromValue(call.output, ids);
    }
  }
  return ids;
}

function collectFromValue(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, into);
    return;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['document_id'] === 'string') into.add(obj['document_id']);
    if (typeof obj['id'] === 'string') into.add(obj['id']);
  }
}
