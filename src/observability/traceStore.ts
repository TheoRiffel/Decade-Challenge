import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import type { TraceSnapshot } from './trace.js';

/**
 * Bounded in-memory store for recent trace snapshots, keyed by requestId.
 * Lets the /sources endpoint retrieve tool outputs without reading the JSONL
 * file. Evicts the oldest entry once the limit is reached (insertion order).
 *
 * Falls back to scanning the JSONL file on miss, so that /sources requests
 * survive a `tsx watch` backend restart in development.
 */
const MAX_ENTRIES = 100;
const store = new Map<string, TraceSnapshot>();

export function putTrace(snapshot: TraceSnapshot): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(snapshot.requestId, snapshot);
}

export async function getTrace(requestId: string): Promise<TraceSnapshot | undefined> {
  const cached = store.get(requestId);
  if (cached) return cached;
  return readFromJsonl(requestId);
}

async function readFromJsonl(requestId: string): Promise<TraceSnapshot | undefined> {
  let raw: string;
  try {
    raw = await readFile(config.observability.traceFile, 'utf8');
  } catch {
    return undefined;
  }

  // Scan lines in reverse so the most recent entry wins if there are duplicates.
  const lines = raw.split('\n').filter(Boolean).reverse();
  for (const line of lines) {
    let snapshot: TraceSnapshot;
    try {
      snapshot = JSON.parse(line) as TraceSnapshot;
    } catch {
      continue;
    }
    if (snapshot.requestId === requestId) {
      // Warm the in-memory cache so subsequent requests skip the file scan.
      putTrace(snapshot);
      return snapshot;
    }
  }
  return undefined;
}
