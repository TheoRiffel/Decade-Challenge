'use client';

import { FileText, Table, X } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateName(name: string, max = 30): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0) {
    const suffix = name.slice(ext); // ".pdf"
    const keep = max - suffix.length - 1;
    return `${name.slice(0, Math.max(keep, 1))}…${suffix}`;
  }
  return `${name.slice(0, max - 1)}…`;
}

export function AttachmentChip({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const isSpreadsheet = ext === 'xlsx' || ext === 'xls';
  const Icon = isSpreadsheet ? Table : FileText;

  return (
    <div className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white border border-gray-200 rounded-lg text-xs shadow-sm max-w-[240px]">
      <Icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
      <span className="text-gray-700 truncate">{truncateName(file.name)}</span>
      <span className="text-slate-400 flex-shrink-0">{formatSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 ml-0.5 p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label={`Remove ${file.name}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/** Read-only chip for conversation history (no remove button). */
export function AttachmentHistoryChip({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const isSpreadsheet = ext === 'xlsx' || ext === 'xls';
  const Icon = isSpreadsheet ? Table : FileText;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded text-xs text-white/90">
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span className="truncate max-w-[180px]">{truncateName(name)}</span>
    </span>
  );
}
