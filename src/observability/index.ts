import { config } from '../config.js';
import {
  createCompositeSink,
  createConsoleSink,
  createJsonlSink,
  type TraceSink,
} from './sink.js';

/**
 * The default trace sink — instantiated once per process. Composes a console
 * one-liner with a JSONL audit log. Replace at the boundary (e.g., for
 * tests) by swapping the import.
 */
export const traceSink: TraceSink = createCompositeSink(
  createConsoleSink(),
  createJsonlSink(config.observability.traceFile),
);

export type { TraceSink } from './sink.js';
