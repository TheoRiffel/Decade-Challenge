import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { runAgent } from '../agent/loop.js';
import { client } from '../db/index.js';
import { createTrace, type TraceSnapshot } from '../observability/trace.js';
import {
  disclaimerPresence,
  faithfulness,
  languageMatch,
  scopeBehavior,
  sourcePrecision,
  toolCallEfficiency,
  type GoldenCase,
  type MetricResult,
} from './metrics.js';

const GOLDEN_PATH = resolve(process.cwd(), 'src/eval/golden.json');
const REPORT_PATH = resolve(process.cwd(), 'logs/eval-report.json');

const METRIC_NAMES = [
  'faithfulness',
  'scope_behavior',
  'source_precision',
  'disclaimer_presence',
  'language_match',
  'tool_call_efficiency',
] as const;

type CaseResult = {
  case: GoldenCase;
  response?: string;
  metrics?: MetricResult[];
  error?: string;
  durationMs?: number;
};

async function loadGolden(): Promise<GoldenCase[]> {
  const text = await readFile(GOLDEN_PATH, 'utf8');
  return JSON.parse(text) as GoldenCase[];
}

async function runCase(c: GoldenCase): Promise<CaseResult> {
  const t0 = performance.now();
  try {
    const trace = createTrace({ userMessage: c.query });
    let resolveSnapshot!: (s: TraceSnapshot) => void;
    const whenDone = new Promise<TraceSnapshot>((res) => { resolveSnapshot = res; });

    const stream = runAgent({
      messages: [{ role: 'user', content: c.query }],
      trace,
      onDone: (snapshot) => resolveSnapshot(snapshot),
    });

    // Consuming stream.text drives the AI SDK loop and fires onFinish / onDone.
    await stream.text;
    const snapshot = await whenDone;

    const metrics = await Promise.all([
      faithfulness(snapshot, c),
      scopeBehavior(snapshot, c),
      sourcePrecision(snapshot, c),
      disclaimerPresence(snapshot, c),
      languageMatch(snapshot, c),
      toolCallEfficiency(snapshot, c),
    ]);
    return {
      case: c,
      response: snapshot.finalResponse,
      metrics,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err) {
    return {
      case: c,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - t0),
    };
  }
}

function summarize(results: CaseResult[]): void {
  const counts = new Map<
    string,
    { pass: number; total: number; scoreSum: number; scoreCount: number }
  >();
  for (const name of METRIC_NAMES) {
    counts.set(name, { pass: 0, total: 0, scoreSum: 0, scoreCount: 0 });
  }
  let errorCases = 0;

  for (const r of results) {
    if (r.error || !r.metrics) {
      errorCases++;
      continue;
    }
    for (const m of r.metrics) {
      const c = counts.get(m.name);
      if (!c) continue;
      c.total++;
      if (m.passed) c.pass++;
      if (typeof m.score === 'number') {
        c.scoreSum += m.score;
        c.scoreCount++;
      }
    }
  }

  console.log('\n=== Eval Summary ===');
  console.log(`Cases: ${results.length}  Errors: ${errorCases}`);
  console.log('\nMetric                     Pass        Avg score');
  for (const name of METRIC_NAMES) {
    const c = counts.get(name);
    if (!c) continue;
    const passStr =
      c.total === 0 ? '   —   ' : `${c.pass}/${c.total} (${((c.pass / c.total) * 100).toFixed(0)}%)`;
    const avg =
      c.scoreCount > 0 ? `${(c.scoreSum / c.scoreCount).toFixed(2)}` : ' — ';
    console.log(`  ${name.padEnd(24)} ${passStr.padEnd(11)} ${avg}`);
  }

  const failing = results.filter(
    (r) => r.metrics && r.metrics.some((m) => !m.passed),
  );
  if (failing.length > 0) {
    console.log('\nFailing cases:');
    for (const r of failing) {
      const fails = (r.metrics ?? [])
        .filter((m) => !m.passed)
        .map((m) => m.name)
        .join(', ');
      console.log(`  ${r.case.id}  -> ${fails}`);
    }
  }
}

async function main(): Promise<void> {
  const cases = await loadGolden();
  if (cases.length === 0) {
    console.log('golden.json is empty — add cases (see ARCHITECTURE.md §17).');
    await client.end();
    return;
  }
  console.log(`→ running eval on ${cases.length} case(s)`);

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id} ... `);
    const r = await runCase(c);
    if (r.error) {
      console.log(`ERROR (${r.durationMs ?? 0}ms): ${r.error}`);
    } else {
      const passCount = (r.metrics ?? []).filter((m) => m.passed).length;
      console.log(
        `${passCount}/${r.metrics?.length ?? 0} pass (${r.durationMs ?? 0}ms)`,
      );
    }
    results.push(r);
  }

  summarize(results);

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(results, null, 2));
  console.log(`\n→ report saved to ${REPORT_PATH}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
