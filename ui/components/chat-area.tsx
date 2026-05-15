"use client"

import { useEffect, useRef } from "react"
import type { Message } from "@ai-sdk/react"
import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import { AlertCircle, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  UserMessage,
  AssistantMessage,
  type FileAttachment,
  type ReasoningStep,
  type Source,
} from "@/components/chat-messages"
import { ChatInputWithUpload } from "@/components/chat-file-upload"
import { ChatEmptyState } from "@/components/chat-empty-state"

// ── Source footer parser ──────────────────────────────────────────────────────

const SOURCES_RE = /\n(?:---\n+)?\*{0,2}Sources:\*{0,2}\s*(.+)$/m

function parseContent(content: string): { main: string; docIds: string[] } {
  const match = SOURCES_RE.exec(content)
  if (!match) return { main: content, docIds: [] }
  const docIds = (match[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return { main: content.slice(0, match.index).trimEnd(), docIds }
}

// ── Tool invocation → ReasoningStep ──────────────────────────────────────────

function stepLabel(toolName: string): string {
  const labels: Record<string, string> = {
    search_convictions: "Searching convictions...",
    read_document: "Reading document...",
    list_documents: "Listing documents...",
    parse_upload: "Parsing upload...",
  }
  return labels[toolName] ?? `${toolName}...`
}

function extractQuery(toolName: string, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const a = args as Record<string, unknown>
  if (toolName === "search_convictions") return typeof a.query === "string" ? a.query : undefined
  if (toolName === "read_document") return typeof a.document_id === "string" ? a.document_id : undefined
  if (toolName === "parse_upload") return typeof a.filename === "string" ? a.filename : undefined
  return undefined
}

function extractDocIds(toolName: string, args: unknown, result: unknown): string[] {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {}
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {}
  if (toolName === "search_convictions") {
    const ids = r.document_ids
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []
  }
  if (toolName === "read_document") {
    const id = a.document_id
    return typeof id === "string" ? [id] : []
  }
  if (toolName === "parse_upload") {
    const id = a.filename ?? r.document_id
    return typeof id === "string" ? [id] : []
  }
  return []
}

function stepResult(toolName: string, args: unknown, result: unknown): string {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {}
  if (toolName === "search_convictions") {
    const total = typeof r.total === "number" ? r.total : undefined
    const ids = Array.isArray(r.document_ids) ? r.document_ids : []
    const docCount = new Set(ids).size
    if (total !== undefined)
      return docCount > 0 ? `Found ${total} chunks in ${docCount} ${docCount === 1 ? "document" : "documents"}` : `Found ${total} chunks`
    return "Search complete"
  }
  if (toolName === "read_document") {
    const title = typeof r.title === "string" ? r.title : undefined
    const chars = typeof r.content === "string" ? r.content.length : undefined
    if (title && chars !== undefined) return `Loaded "${title}" (${chars} chars)`
    if (title) return `Loaded "${title}"`
    return "Document read"
  }
  if (toolName === "list_documents")
    return Array.isArray(r.documents) ? `${r.documents.length} documents available` : "Documents listed"
  if (toolName === "parse_upload") {
    const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {}
    const filename = typeof a.filename === "string" ? a.filename : undefined
    return filename ? `Parsed ${filename}` : "Upload parsed"
  }
  return "Done"
}

function toReasoningSteps(parts: ToolInvocationUIPart[]): ReasoningStep[] {
  return parts.map((p) => {
    const inv = p.toolInvocation
    const args = "args" in inv ? inv.args : undefined
    const result = inv.state === "result" ? inv.result : undefined
    return {
      id: inv.toolCallId,
      type: inv.toolName as ReasoningStep["type"],
      status: inv.state === "result" ? "done" : "loading",
      label: stepLabel(inv.toolName),
      query: extractQuery(inv.toolName, args),
      docIds: extractDocIds(inv.toolName, args, result),
      result: inv.state === "result" ? stepResult(inv.toolName, args, result) : undefined,
    }
  })
}

// ── Data stream chunk content parser ─────────────────────────────────────────

type ChunkData = { title: string; chunks: Array<{ id: string; content: string }> }

function parseDataChunks(data: unknown[]): Record<string, ChunkData> {
  const out: Record<string, ChunkData> = {}
  for (const item of data) {
    if (
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).type === "sources"
    ) {
      const sources = (item as Record<string, unknown>).sources as
        | Record<string, ChunkData>
        | undefined
      if (sources) Object.assign(out, sources)
    }
  }
  return out
}

function toSources(docIds: string[], chunks: Record<string, ChunkData>): Source[] {
  return docIds.map((docId) => {
    const isUpload = docId.startsWith("uploaded/")
    const label = isUpload ? docId.replace("uploaded/", "") : docId
    const data = chunks[docId]
    return {
      id: docId,
      type: isUpload ? "upload" : "conviction",
      label,
      documentTitle: data?.title ?? label,
      documentId: docId,
      chunks: data?.chunks ?? [],
    } satisfies Source
  })
}

// ── Final text extractor — last text part wins; falls back to full content ────

function extractFinalText(parts: Message["parts"] | undefined, fallback: string): string {
  if (!parts?.length) return fallback
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p?.type === "text") return (p as { type: "text"; text: string }).text
  }
  return fallback
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  messages: Message[]
  input: string
  setInput: (value: string) => void
  onSubmit: (files: File[]) => void
  isLoading: boolean
  error: Error | undefined
  onSuggestionSelect: (query: string) => void
  data?: unknown[]
  attachmentsByMsgId: Map<string, string[]>
  traceIdByMsgId: Map<string, string>
}

export function ChatArea({
  messages,
  input,
  setInput,
  onSubmit,
  isLoading,
  error,
  onSuggestionSelect,
  data = [],
  attachmentsByMsgId,
  traceIdByMsgId,
}: ChatAreaProps) {
  const isEmpty = messages.length === 0
  const scrollRef = useRef<HTMLDivElement>(null)

  // Stay pinned to bottom while streaming; jump there when a new message arrives.
  // The near-bottom guard lets users scroll up to re-read without being yanked down.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  const dataChunks = parseDataChunks(data)

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">
            {isEmpty ? "New Conversation" : "Portfolio Analysis"}
          </h1>
          {!isEmpty && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-6 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-xs text-red-400">
            {error.message || "Something went wrong. Please try again."}
          </p>
        </div>
      )}

      {/* Messages or empty state */}
      {isEmpty ? (
        <ChatEmptyState onQuerySelect={onSuggestionSelect} />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {messages.map((m) => {
              if (m.role === "user") {
                const fileNames = attachmentsByMsgId.get(m.id) ?? []
                const files: FileAttachment[] = fileNames.map((name) => ({
                  name,
                  type: name.toLowerCase().endsWith(".pdf")
                    ? "pdf"
                    : name.toLowerCase().endsWith(".xlsx") || name.toLowerCase().endsWith(".xls")
                    ? "xlsx"
                    : "other",
                }))
                return (
                  <UserMessage
                    key={m.id}
                    content={m.content}
                    files={files.length > 0 ? files : undefined}
                  />
                )
              }

              const toolParts = (m.parts ?? []).filter(
                (p): p is ToolInvocationUIPart => p.type === "tool-invocation",
              )
              const reasoningSteps = toReasoningSteps(toolParts)
              const { main, docIds } = parseContent(extractFinalText(m.parts, m.content))
              const sources = toSources(docIds, dataChunks)

              return (
                <AssistantMessage
                  key={m.id}
                  content={main}
                  reasoningSteps={reasoningSteps}
                  sources={sources}
                  traceId={traceIdByMsgId.get(m.id)}
                  isStreaming={isLoading && m.id === messages.at(-1)?.id}
                />
              )
            })}

            {/* Waiting indicator — show empty AssistantMessage shell while streaming starts */}
            {isLoading && messages.at(-1)?.role !== "assistant" && (
              <AssistantMessage content="" reasoningSteps={[]} sources={[]} />
            )}

          </div>
        </div>
      )}

      {/* Input */}
      <ChatInputWithUpload
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        disabled={isLoading}
      />
    </div>
  )
}
