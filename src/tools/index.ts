import type { ToolSet } from '../providers/llm.js';
import type { Trace } from '../observability/trace.js';
import type { UploadSession } from '../uploads/session.js';
import { listDocumentsTool } from './listDocuments.js';
import { makeParseUploadTool } from './parseUpload.js';
import { readDocumentTool } from './readDocument.js';
import { searchConvictionsTool } from './searchConvictions.js';

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
 * Trace recording for tool calls is handled by the agent loop's
 * onStepFinish callback (ARCHITECTURE.md §16); tools themselves stay pure.
 * The `trace` argument is accepted for forward compatibility.
 */
export function buildTools(args: BuildToolsArgs): ToolSet {
  void args.trace;
  return {
    search_convictions: searchConvictionsTool,
    read_document: readDocumentTool,
    list_documents: listDocumentsTool,
    ...(args.uploads
      ? { parse_upload: makeParseUploadTool(args.uploads) }
      : {}),
  };
}
