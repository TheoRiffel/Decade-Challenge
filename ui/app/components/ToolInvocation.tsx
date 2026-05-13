'use client';

import { useState } from 'react';
import { Check, ChevronRight, FileText, List, Search, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolInvocation, ToolInvocationUIPart } from '@ai-sdk/ui-utils';

// ── Icons ────────────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, LucideIcon> = {
  search_convictions: Search,
  read_document: FileText,
  list_documents: List,
  parse_upload: Upload,
};

function getIcon(toolName: string): LucideIcon {
  return TOOL_ICONS[toolName] ?? Search;
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function clamp(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function isErrorResult(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

function loadingLabel(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'search_convictions': {
      const q = typeof args['query'] === 'string' ? args['query'] : '';
      return clamp(`Searching: "${q}"`);
    }
    case 'read_document': {
      const id = typeof args['document_id'] === 'string' ? args['document_id'] : '';
      return clamp(`Reading: ${id}`);
    }
    case 'list_documents':
      return 'Browsing catalog…';
    case 'parse_upload':
      return 'Reading uploaded file…';
    default:
      return `Running ${toolName}…`;
  }
}

function resultLabel(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): string {
  switch (toolName) {
    case 'search_convictions': {
      if (isErrorResult(result)) return 'Search unavailable';
      const q = typeof args['query'] === 'string' ? args['query'] : '';
      if (!Array.isArray(result) || result.length === 0)
        return clamp(`"${q}" — no results`);
      const hits = result as Array<{ document_id?: unknown }>;
      const n = hits.length;
      const m = new Set(hits.map((h) => h.document_id).filter(Boolean)).size;
      return clamp(`"${q}" — ${n} chunk${n !== 1 ? 's' : ''} across ${m} doc${m !== 1 ? 's' : ''}`);
    }
    case 'read_document': {
      if (isErrorResult(result)) return 'Document not found';
      const r = result as Record<string, unknown>;
      const fallbackId =
        typeof args['document_id'] === 'string' ? args['document_id'] : '';
      const title = typeof r['title'] === 'string' && r['title'] ? r['title'] : fallbackId;
      return clamp(`Loaded "${title}"`);
    }
    case 'list_documents': {
      if (isErrorResult(result)) return 'Catalog unavailable';
      if (!Array.isArray(result)) return 'Documents listed';
      const n = result.length;
      return `${n} document${n !== 1 ? 's' : ''} available`;
    }
    case 'parse_upload': {
      if (isErrorResult(result)) return 'Parse failed';
      const r = result as Record<string, unknown>;
      const filename =
        typeof r['filename'] === 'string' ? r['filename'] : 'file';
      const trunc = r['truncated'] === true ? ' (truncated)' : '';
      return clamp(`Parsed ${filename}${trunc}`);
    }
    default:
      return clamp(`${toolName} completed`);
  }
}

// ── Single step ───────────────────────────────────────────────────────────────

function ToolStep({ invocation }: { invocation: ToolInvocation }) {
  const isDone = invocation.state === 'result';
  const Icon = getIcon(invocation.toolName);
  const args = (invocation.args ?? {}) as Record<string, unknown>;
  const result = isDone ? (invocation as { result: unknown }).result : undefined;

  const label = isDone
    ? resultLabel(invocation.toolName, args, result)
    : loadingLabel(invocation.toolName, args);

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <Icon className="w-3 h-3 flex-shrink-0 text-slate-400" />
      <span className="flex-1 min-w-0 truncate text-slate-500 text-xs">{label}</span>
      {isDone ? (
        <Check className="w-3 h-3 flex-shrink-0 text-emerald-500" />
      ) : (
        <span className="w-1.5 h-1.5 flex-shrink-0 rounded-full bg-slate-400 animate-pulse" />
      )}
    </div>
  );
}

// ── List (exported) ───────────────────────────────────────────────────────────

export function ToolInvocationList({ parts }: { parts: ToolInvocationUIPart[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (parts.length === 0) return null;

  const hasRunning = parts.some((p) => p.toolInvocation.state !== 'result');
  const n = parts.length;

  // While tools are still running: show live steps inline (no toggle)
  if (hasRunning) {
    return (
      <div className="mb-3 pl-2.5 border-l-2 border-slate-200 space-y-0.5">
        {parts.map((p) => (
          <ToolStep key={p.toolInvocation.toolCallId} invocation={p.toolInvocation} />
        ))}
      </div>
    );
  }

  // All done: collapsible summary
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ChevronRight
          className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
        />
        <span>
          How I answered this ({n} step{n !== 1 ? 's' : ''})
        </span>
      </button>

      {isOpen && (
        <div className="mt-1.5 pl-2.5 border-l-2 border-slate-200 space-y-0.5">
          {parts.map((p) => (
            <ToolStep key={p.toolInvocation.toolCallId} invocation={p.toolInvocation} />
          ))}
        </div>
      )}
    </div>
  );
}
