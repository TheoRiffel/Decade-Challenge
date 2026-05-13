import type { TraceSnapshot } from './trace.js';

/**
 * Bounded in-memory store for recent trace snapshots, keyed by requestId.
 * Lets the /sources endpoint retrieve tool outputs without reading the JSONL
 * file. Evicts the oldest entry once the limit is reached (insertion order).
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

export function getTrace(requestId: string): TraceSnapshot | undefined {
  return store.get(requestId);
}
