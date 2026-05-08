import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TraceSnapshot } from './trace.js';

/**
 * Per ARCHITECTURE.md §16: traces persist as structured JSON. v1 ships a
 * console one-liner (operability) and a JSONL file (audit / replay). Step 8
 * intentionally keeps full tool outputs in JSONL — "reproducible from its
 * trace alone" is the hard requirement and v1's corpus is small enough that
 * we don't need to truncate. v2 swaps in Langfuse / Helicone via a new sink
 * that implements this interface.
 */
export interface TraceSink {
  write(snapshot: TraceSnapshot): Promise<void>;
}

export function createConsoleSink(): TraceSink {
  return {
    async write(snapshot) {
      const totalToolCalls = snapshot.steps.reduce(
        (acc, s) => acc + s.toolCalls.length,
        0,
      );
      const validation = snapshot.validation
        ? {
            ok:
              snapshot.validation.toolUseOk &&
              snapshot.validation.sourceAttributionOk &&
              snapshot.validation.disclaimerOk &&
              snapshot.validation.languageMatchOk,
            warnings: snapshot.validation.warnings.length,
          }
        : null;
      const summary = {
        event: 'chat',
        requestId: snapshot.requestId,
        durationMs: durationMs(snapshot.startedAt, snapshot.finishedAt),
        steps: snapshot.steps.length,
        toolCalls: totalToolCalls,
        tokens: snapshot.totals,
        validation,
      };
      console.log(JSON.stringify(summary));
    },
  };
}

export function createJsonlSink(filePath: string): TraceSink {
  let dirReady = false;
  return {
    async write(snapshot) {
      try {
        if (!dirReady) {
          await mkdir(dirname(filePath), { recursive: true });
          dirReady = true;
        }
        await appendFile(filePath, JSON.stringify(snapshot) + '\n', 'utf8');
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'trace_sink_error',
            sink: 'jsonl',
            file: filePath,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
  };
}

export function createCompositeSink(...sinks: TraceSink[]): TraceSink {
  return {
    async write(snapshot) {
      await Promise.all(sinks.map((s) => s.write(snapshot)));
    },
  };
}

function durationMs(startIso: string, endIso: string): number {
  return Math.max(0, Date.parse(endIso) - Date.parse(startIso));
}
