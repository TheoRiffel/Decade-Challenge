'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

type SourceChunk = {
  chunk_id: string;
  content: string;
  score?: number;
};

type DocumentSource = {
  title: string | null;
  document_id: string;
  chunks: SourceChunk[];
};

type SourcesResponse = Record<string, DocumentSource>;

export type ActiveSource = {
  docId: string;
  traceId: string;
  isUpload: boolean;
};

// ── Panel ─────────────────────────────────────────────────────────────────────

export function SourcePanel({
  source,
  onClose,
}: {
  source: ActiveSource;
  onClose: () => void;
}) {
  const { docId, traceId, isUpload } = source;
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/sources/${encodeURIComponent(traceId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<SourcesResponse>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [traceId]);

  const doc = data?.[docId];
  const displayId = isUpload ? docId.replace('uploaded/', '') : docId;
  const label = isUpload ? 'Uploaded file' : 'Conviction document';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative z-10 flex flex-col w-full max-w-md bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-slate-400 mb-0.5 uppercase tracking-wide">{label}</p>
            {doc?.title && (
              <h2 className="text-sm font-semibold text-gray-900 leading-tight">
                {doc.title}
              </h2>
            )}
            <p className="text-xs font-mono text-slate-400 truncate mt-0.5">{displayId}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 mt-0.5 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close source panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <p className="text-sm text-slate-400 text-center py-12">Loading…</p>
          )}

          {error && (
            <p className="text-sm text-red-500 text-center py-12">{error}</p>
          )}

          {!loading && !error && !doc && (
            <p className="text-sm text-slate-400 text-center py-12">
              No chunks recorded for this document.
            </p>
          )}

          {doc && doc.chunks.length > 0 && (
            <div className="space-y-4">
              {doc.chunks.map((chunk) => (
                <div
                  key={chunk.chunk_id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-400 truncate max-w-[75%]">
                      {chunk.chunk_id}
                    </span>
                    {chunk.score !== undefined && (
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {chunk.score.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
