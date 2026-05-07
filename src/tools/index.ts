import type { Trace } from '../observability/trace.js';
import type { UploadSession } from '../uploads/session.js';

export type BuildToolsArgs = {
  trace: Trace;
  uploads?: UploadSession;
};

/**
 * Builds the tool map handed to the agent loop in agent/loop.ts.
 *
 * - search_convictions, read_document, list_documents are always present.
 * - parse_upload is registered only when an UploadSession is provided
 *   (i.e., the request had file attachments).
 *
 * Each execute call records its input/output/latency on `trace`.
 *
 * Return type is intentionally inferred — it should resolve to the AI SDK
 * ToolSet shape once the version is locked at implementation time.
 */
export function buildTools(_args: BuildToolsArgs) {
  throw new Error('not implemented');
}
