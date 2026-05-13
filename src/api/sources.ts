import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { getTrace } from '../observability/traceStore.js';

export type SourceChunk = {
  chunk_id: string;
  content: string;
  score?: number | undefined;
};

export type DocumentSource = {
  title: string | null;
  document_id: string;
  chunks: SourceChunk[];
};

/** Map of document_id (or "uploaded/<filename>") → source detail. */
export type SourcesResponse = Record<string, DocumentSource>;

export const sourcesRouter = new Hono();

sourcesRouter.use(
  cors({
    origin: 'http://localhost:3001',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

/**
 * GET /sources/:traceId
 *
 * Returns the chunks the agent actually saw for each cited document, derived
 * from the trace's recorded tool call outputs. Called lazily by the frontend
 * when a citation pill is clicked.
 */
sourcesRouter.get('/:traceId', (c) => {
  const traceId = c.req.param('traceId');
  const trace = getTrace(traceId);

  if (!trace) {
    return c.json({ error: `Trace "${traceId}" not found (may have expired).` }, 404);
  }

  const sources: SourcesResponse = {};

  function getOrCreate(docId: string, title: string | null = null): DocumentSource {
    if (!sources[docId]) {
      sources[docId] = { title, document_id: docId, chunks: [] };
    }
    return sources[docId];
  }

  for (const step of trace.steps) {
    for (const call of step.toolCalls) {
      const out = call.output;

      if (call.toolName === 'search_convictions') {
        if (!Array.isArray(out)) continue;
        for (const hit of out as Array<Record<string, unknown>>) {
          const docId = typeof hit['document_id'] === 'string' ? hit['document_id'] : null;
          const chunkId = typeof hit['chunk_id'] === 'string' ? hit['chunk_id'] : null;
          const content = typeof hit['content'] === 'string' ? hit['content'] : '';
          const score = typeof hit['score'] === 'number' ? hit['score'] : undefined;
          if (!docId || !chunkId) continue;

          const src = getOrCreate(docId);
          if (!src.chunks.some((ch) => ch.chunk_id === chunkId)) {
            src.chunks.push({ chunk_id: chunkId, content, score });
          }
        }
      } else if (call.toolName === 'read_document') {
        if (!isObject(out) || 'error' in out) continue;
        const docId = typeof out['id'] === 'string' ? out['id'] : null;
        if (!docId) continue;

        const title = typeof out['title'] === 'string' ? out['title'] : null;
        const content = typeof out['content'] === 'string' ? out['content'] : '';
        const src = getOrCreate(docId, title);
        if (title && !src.title) src.title = title;

        const chunkId = `${docId}__full`;
        if (!src.chunks.some((ch) => ch.chunk_id === chunkId)) {
          src.chunks.push({ chunk_id: chunkId, content });
        }
      } else if (call.toolName === 'parse_upload') {
        if (!isObject(out) || 'error' in out) continue;
        const filename = typeof out['filename'] === 'string' ? out['filename'] : null;
        if (!filename) continue;

        const key = `uploaded/${filename}`;
        const content = typeof out['content'] === 'string' ? out['content'] : '';
        const src = getOrCreate(key, filename);

        const chunkId = `${key}__content`;
        if (!src.chunks.some((ch) => ch.chunk_id === chunkId)) {
          src.chunks.push({ chunk_id: chunkId, content });
        }
      }
    }
  }

  return c.json(sources);
});

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
