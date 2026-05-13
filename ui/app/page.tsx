'use client';

import { useChat } from '@ai-sdk/react';
import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { AlertCircle, BookOpen, Paperclip, RefreshCw, Send, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttachmentChip, AttachmentHistoryChip } from './components/AttachmentChip';
import { DropZone } from './components/DropZone';
import { MessageContent } from './components/MessageContent';
import { SourcePanel, type ActiveSource } from './components/SourcePanel';
import { ToolInvocationList } from './components/ToolInvocation';

// ── File validation ───────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_MSG = 3;

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const ACCEPTED_EXTS = new Set(['.pdf', '.xlsx', '.xls']);

function isAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.has(file.type)) return true;
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  return ACCEPTED_EXTS.has(ext);
}

// ── Sources footer parser ─────────────────────────────────────────────────────

const SOURCES_RE = /\nSources:\s*(.+)$/m;

function parseContent(content: string): { main: string; docIds: string[] } {
  const match = SOURCES_RE.exec(content);
  if (!match) return { main: content, docIds: [] };
  const docIds = (match[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { main: content.slice(0, match.index).trimEnd(), docIds };
}

// ── Demo queries ──────────────────────────────────────────────────────────────

const DEMO_QUERIES = [
  'O que é um CDB e como funciona?',
  'Compare CDB e CRA em termos de tributação',
  'How is cryptocurrency taxed in Brazil?',
] as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<ActiveSource | null>(null);

  const pendingFilesRef = useRef<File[]>([]);
  pendingFilesRef.current = pendingFiles;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitCount = useRef(0);
  const attachmentsBySubmitIdx = useRef(new Map<number, string[]>());

  const pendingRequestId = useRef<string | null>(null);
  const requestIdByMessage = useRef(new Map<string, string>());

  // ── Custom fetch: rebuild as multipart when files are queued ────────────────
  const customFetch = useCallback<typeof globalThis.fetch>(
    async (input, init) => {
      const files = pendingFilesRef.current;
      if (files.length === 0) return globalThis.fetch(input, init);

      const rawBody = (init?.body as string | null | undefined) ?? '{}';
      const jsonBody = JSON.parse(rawBody) as { messages?: unknown; id?: string };

      const formData = new FormData();
      formData.append('messages', JSON.stringify(jsonBody.messages ?? []));
      if (jsonBody.id) formData.append('requestId', jsonBody.id);
      for (const file of files) formData.append('files', file);

      const { 'Content-Type': _ct, ...restHeaders } = (
        (init?.headers ?? {}) as Record<string, string>
      );

      return globalThis.fetch(input, {
        method: 'POST',
        body: formData,
        headers: restHeaders,
        signal: init?.signal,
        credentials: init?.credentials,
      });
    },
    [],
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: chatSubmit,
    status,
    error,
    reload,
    append: chatAppend,
  } = useChat({
    api: '/api/chat',
    fetch: customFetch,
    onResponse: (response) => {
      pendingRequestId.current = response.headers.get('x-request-id');
    },
    onFinish: (message) => {
      if (pendingRequestId.current) {
        requestIdByMessage.current.set(message.id, pendingRequestId.current);
        pendingRequestId.current = null;
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // ── Submit wrapper ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() && pendingFilesRef.current.length === 0) return;

      if (pendingFilesRef.current.length > 0) {
        const idx = submitCount.current;
        attachmentsBySubmitIdx.current.set(
          idx,
          pendingFilesRef.current.map((f) => f.name),
        );
      }
      submitCount.current += 1;
      setPendingFiles([]);
      setAttachError(null);
      chatSubmit(e);
    },
    [input, chatSubmit],
  );

  // ── Suggestion chip submit ──────────────────────────────────────────────────
  const submitSuggestion = useCallback(
    (query: string) => {
      if (isLoading) return;
      submitCount.current += 1;
      void chatAppend({ role: 'user', content: query });
    },
    [isLoading, chatAppend],
  );

  // ── File handling ───────────────────────────────────────────────────────────
  function addFiles(candidates: File[]) {
    const errors: string[] = [];
    const valid: File[] = [];

    for (const f of candidates) {
      if (!isAccepted(f)) {
        errors.push(`"${f.name}" is not a supported format`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errors.push(`"${f.name}" exceeds the 25 MB limit`);
        continue;
      }
      valid.push(f);
    }

    setPendingFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES_PER_MSG) {
        errors.push(`Max ${MAX_FILES_PER_MSG} files per message — extras dropped`);
        return combined.slice(0, MAX_FILES_PER_MSG);
      }
      return combined;
    });

    setAttachError(errors.length > 0 ? errors.join(' · ') : null);
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Render ──────────────────────────────────────────────────────────────────
  let userMsgIdx = -1;

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <header className="px-6 py-4 border-b border-gray-200 bg-white shadow-sm flex-shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Decade Conviction Assistant</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Investment research grounded on Decade&apos;s convictions
        </p>
      </header>

      <DropZone onFiles={addFiles}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-6">
              <p className="text-sm text-gray-400">
                Ask a question about Decade&apos;s investment convictions.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {DEMO_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => submitSuggestion(q)}
                    disabled={isLoading}
                    className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs text-gray-600
                               hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const isAssistant = m.role === 'assistant';
            if (m.role === 'user') userMsgIdx += 1;

            const toolParts = isAssistant
              ? (m.parts ?? []).filter(
                  (p): p is ToolInvocationUIPart => p.type === 'tool-invocation',
                )
              : [];

            const { main, docIds } = isAssistant
              ? parseContent(m.content)
              : { main: m.content, docIds: [] };

            const traceId = requestIdByMessage.current.get(m.id);
            const attachedNames =
              m.role === 'user'
                ? (attachmentsBySubmitIdx.current.get(userMsgIdx) ?? [])
                : [];

            return (
              <div
                key={m.id}
                className={`flex animate-fade-in ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white whitespace-pre-wrap leading-relaxed'
                      : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                  }`}
                >
                  {isAssistant && <ToolInvocationList parts={toolParts} />}

                  {isAssistant ? (
                    <MessageContent text={main} />
                  ) : (
                    main
                  )}

                  {/* Attached files in user message history */}
                  {attachedNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {attachedNames.map((name) => (
                        <AttachmentHistoryChip key={name} name={name} />
                      ))}
                    </div>
                  )}

                  {/* Citation pills */}
                  {docIds.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
                      {docIds.map((docId) => {
                        const isUpload = docId.startsWith('uploaded/');
                        const isActive = activeSource?.docId === docId;
                        const Icon = isUpload ? Upload : BookOpen;
                        const label = isUpload ? docId.replace('uploaded/', '') : docId;

                        return (
                          <button
                            key={docId}
                            onClick={() =>
                              traceId
                                ? setActiveSource({ docId, traceId, isUpload })
                                : undefined
                            }
                            disabled={!traceId}
                            title={docId}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              isUpload
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            } ${isActive ? 'ring-2 ring-offset-1 ring-emerald-400' : ''} disabled:opacity-50 disabled:cursor-default`}
                          >
                            <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="truncate max-w-[180px]">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading placeholder — pulsing dots */}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 shadow-sm">
                <div className="flex gap-1.5 items-center h-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 typing-dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 typing-dot typing-dot-2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 typing-dot typing-dot-3" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
          {/* Error banner */}
          {error && (
            <div className="mb-3 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
              <p className="flex-1 text-xs text-red-700 min-w-0 line-clamp-2">
                {error.message || 'Something went wrong. Please try again.'}
              </p>
              <button
                type="button"
                onClick={() => reload()}
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          {/* Validation error */}
          {attachError && (
            <p className="mb-2 text-xs text-red-600">{attachError}</p>
          )}

          {/* Pending attachment chips */}
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map((file, i) => (
                <AttachmentChip
                  key={`${file.name}-${i}`}
                  file={file}
                  onRemove={() => removeFile(i)}
                />
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || pendingFiles.length >= MAX_FILES_PER_MSG}
              title="Attach PDF or Excel file"
              className="flex-shrink-0 rounded-lg border border-gray-300 px-3 py-2.5 text-slate-500
                         hover:bg-gray-50 hover:text-slate-700 active:bg-gray-100
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Paperclip size={16} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />

            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about Decade's investment convictions…"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
            />

            <button
              type="submit"
              disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
              className="flex-shrink-0 rounded-lg bg-blue-600 text-white px-4 py-2.5
                         hover:bg-blue-700 active:bg-blue-800
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors flex items-center justify-center"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </DropZone>

      {activeSource && (
        <SourcePanel source={activeSource} onClose={() => setActiveSource(null)} />
      )}
    </div>
  );
}
