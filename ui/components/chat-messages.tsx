"use client"

import { useState, useRef } from "react"
import { Search, FileText, List, Paperclip, ChevronRight, File } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SourcePanel } from "@/components/source-panel"
import { MessageContent } from "@/components/message-content"
import { cn } from "@/lib/utils"

// Types
export interface FileAttachment {
  name: string
  type: "pdf" | "doc" | "xlsx" | "other"
}

export interface ReasoningStep {
  id: string
  type: "search_convictions" | "read_document" | "list_documents" | "parse_upload"
  status: "loading" | "done"
  label: string
  query?: string    // search query, document_id, or filename — the interesting arg
  docIds?: string[] // document IDs this step touched (for unique-doc count in chip)
  result?: string
}

export interface SourceChunk {
  id: string
  content: string
}

export interface Source {
  id: string
  type: "conviction" | "upload"
  label: string
  documentTitle?: string
  documentId?: string
  chunks?: SourceChunk[]
}

interface UserMessageProps {
  content: string
  files?: FileAttachment[]
}

interface AssistantMessageProps {
  content: string
  reasoningSteps?: ReasoningStep[]
  sources?: Source[]
  traceId?: string
  isStreaming?: boolean
}

// Helper to get icon for reasoning step
function getStepIcon(type: ReasoningStep["type"]) {
  switch (type) {
    case "search_convictions":
      return Search
    case "read_document":
      return FileText
    case "list_documents":
      return List
    case "parse_upload":
      return Paperclip
  }
}

// User Message Component
export function UserMessage({ content, files }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] space-y-2">
        <div className="rounded-2xl bg-secondary px-4 py-3">
          <p className="text-sm text-foreground">{content}</p>
        </div>
        {files && files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded-md bg-secondary/60 px-2 py-1"
              >
                <File className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{file.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function trunc(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max) + "…"
}

// ── State 1: single animated line while agent is working ──────────────────────
function LiveReasoningIndicator({ steps }: { steps: ReasoningStep[] }) {
  const current = steps.at(-1)

  if (!current) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400/60" />
        <span className="text-xs text-emerald-300/70">Thinking…</span>
      </div>
    )
  }

  const verbs: Record<ReasoningStep["type"], string> = {
    search_convictions: "Searching convictions",
    read_document: current.query ? `Reading ${trunc(current.query, 30)}` : "Reading document",
    list_documents: "Browsing catalog",
    parse_upload: current.query ? `Reading ${current.query}` : "Reading file",
  }

  const queryPart =
    current.type === "search_convictions" && current.query
      ? ` · "${trunc(current.query, 40)}"`
      : ""

  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400/60" />
      <span className="text-xs text-emerald-300/70">
        {verbs[current.type]}
        {queryPart}
        <span className="ml-1.5 text-slate-500">(step {steps.length})</span>
      </span>
    </div>
  )
}

// ── State 3: one table-like row per completed step ────────────────────────────
function ReasoningStepRow({ step }: { step: ReasoningStep }) {
  const Icon = getStepIcon(step.type)

  return (
    <div className="flex items-center gap-2 border-b border-slate-800 py-1.5 last:border-0">
      <Icon className="h-3 w-3 shrink-0 text-slate-500" />
      <span className="font-mono text-xs text-slate-500">{step.type}</span>
      {step.query && (
        <span className="min-w-0 truncate text-xs italic text-slate-400">
          &ldquo;{step.query}&rdquo;
        </span>
      )}
      {step.result && (
        <span className="ml-auto shrink-0 text-xs text-slate-500">{step.result}</span>
      )}
    </div>
  )
}

// ── State 2 + 3: collapsed chip → expandable step list ───────────────────────
function HowIAnsweredDisclosure({ steps }: { steps: ReasoningStep[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const stepCount = steps.length
  const docCount = new Set(steps.flatMap((s) => s.docIds ?? [])).size

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-full bg-slate-800/30 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800/50"
      >
        <ChevronRight
          className={cn("h-3 w-3 transition-transform duration-200", isOpen && "rotate-90")}
        />
        Researched in {stepCount} {stepCount === 1 ? "step" : "steps"}
        {docCount > 0 && ` · ${docCount} ${docCount === 1 ? "document" : "documents"}`}
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          isOpen ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="mt-2 pl-1">
          {steps.map((step) => (
            <ReasoningStepRow key={step.id} step={step} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Assistant Message Component
// Shape the backend returns for each document in /api/sources/:traceId
type BackendDoc = {
  title: string | null
  chunks: Array<{ chunk_id: string; content: string }>
}

export function AssistantMessage({
  content,
  reasoningSteps = [],
  sources = [],
  traceId,
  isStreaming = false,
}: AssistantMessageProps) {
  const [selectedSource, setSelectedSource] = useState<Source | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [isLoadingChunks, setIsLoadingChunks] = useState(false)

  // Cache fetched chunks per docId so we only call /api/sources once per message
  const chunkCache = useRef<Record<string, SourceChunk[]>>({})
  const traceFetched = useRef(false)

  const handleSourceClick = async (source: Source) => {
    // If already cached or no traceId, open immediately
    if (!traceId || traceFetched.current) {
      setSelectedSource({
        ...source,
        chunks: chunkCache.current[source.id] ?? source.chunks ?? [],
      })
      setPanelOpen(true)
      return
    }

    // Open panel with loading indicator while we fetch
    setIsLoadingChunks(true)
    setSelectedSource(source)
    setPanelOpen(true)

    try {
      const resp = await fetch(`/api/sources/${traceId}`)
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, BackendDoc>
        traceFetched.current = true
        for (const [docId, doc] of Object.entries(data)) {
          chunkCache.current[docId] = (doc.chunks ?? []).map((c) => ({
            id: c.chunk_id,
            content: c.content,
          }))
        }
      }
    } catch {
      // Fall through — panel stays open, shows "No chunks found"
    } finally {
      setIsLoadingChunks(false)
      setSelectedSource((prev) =>
        prev ? { ...prev, chunks: chunkCache.current[prev.id] ?? [] } : prev,
      )
    }
  }

  const hasReasoningSteps = reasoningSteps.length > 0
  const hasSources = sources.length > 0

  return (
    <div className="w-full space-y-3">
      {/* Reasoning steps — live indicator while streaming, collapsed chip when done */}
      {isStreaming ? (
        <LiveReasoningIndicator steps={reasoningSteps} />
      ) : hasReasoningSteps ? (
        <HowIAnsweredDisclosure steps={reasoningSteps} />
      ) : null}

      {/* Response Content */}
      {content && (
        <div className="text-sm text-foreground/90">
          <MessageContent text={content} />
        </div>
      )}

      {/* Sources */}
      {hasSources && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <Badge
              key={source.id}
              onClick={() => handleSourceClick(source)}
              className={cn(
                "cursor-pointer text-xs font-normal transition-colors",
                source.type === "conviction"
                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/30"
              )}
            >
              {source.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Source Panel */}
      <SourcePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        loading={isLoadingChunks}
        source={
          selectedSource
            ? {
                id: selectedSource.id,
                title: selectedSource.documentTitle || selectedSource.label,
                documentId: selectedSource.documentId || `DOC-${selectedSource.id.toUpperCase()}`,
                type: selectedSource.type,
                chunks: selectedSource.chunks || [],
              }
            : null
        }
      />
    </div>
  )
}

// Demo Conversation Thread
export function ChatThread() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* User message with file attachment */}
      <UserMessage
        content="Can you analyze this portfolio against our conviction themes?"
        files={[{ name: "portfolio.pdf", type: "pdf" }]}
      />

      {/* Assistant message with full reasoning */}
      <AssistantMessage
        reasoningSteps={[
          {
            id: "1",
            type: "parse_upload",
            status: "done",
            label: "Parsing upload...",
            result: "Parsed portfolio.pdf (12 holdings)",
          },
          {
            id: "2",
            type: "search_convictions",
            status: "done",
            label: "Searching convictions...",
            result: "Found 4 chunks in 2 documents",
          },
          {
            id: "3",
            type: "read_document",
            status: "done",
            label: "Reading document...",
            result: "Read AI Infrastructure thesis",
          },
        ]}
        content={`I've analyzed your portfolio against our active conviction themes. Here's what I found:

**Strong Alignment (4 positions)**
- NVIDIA (NVDA) — directly aligned with our "AI Infrastructure" thesis
- Microsoft (MSFT) — supports both "AI Infrastructure" and "Cloud Dominance" themes
- ASML (ASML) — core holding in our "Semiconductor Leadership" conviction
- Alphabet (GOOGL) — aligned with "AI Infrastructure" thesis

**Partial Alignment (3 positions)**
- Amazon (AMZN) — tangentially related to cloud themes
- Meta (META) — AI exposure but not a core conviction
- Taiwan Semi (TSM) — indirect semiconductor exposure

**No Conviction Match (5 positions)**
The remaining holdings don't currently align with any active research themes. Consider reviewing these positions against your investment mandate.

Would you like me to generate a detailed overlap report or suggest rebalancing opportunities?`}
        sources={[
          {
            id: "conv-1",
            type: "conviction",
            label: "AI Infrastructure v2.3",
            documentTitle: "AI Infrastructure Investment Thesis",
            documentId: "DOC-2024-AI-INFRA-v2.3",
            chunks: [
              {
                id: "chunk-1",
                content: `CDBs (Certificados de Depósito Bancário) represent one of the most 
attractive fixed-income instruments in the Brazilian market for 
institutional investors seeking alpha in emerging market debt.

Key Thesis Points:
1. Yield premium over sovereign bonds (CDI+)
2. Bank credit quality improvements post-2016 reforms
3. Liquidity enhancement through secondary markets

Current Position: OVERWEIGHT
Target Allocation: 8-12% of fixed income sleeve
Risk Rating: Medium (BBB+ average credit quality)`,
              },
              {
                id: "chunk-2",
                content: `Market Dynamics & Catalysts

The CDB market has evolved significantly since the introduction of 
the new resolution framework. We identify three primary catalysts:

• Regulatory tailwinds: BCB Resolution 4,966 improves transparency
• Spread compression opportunity: Current spreads at 115bps over CDI
  represent attractive entry vs. historical average of 85bps
• Duration management: 2-3 year sweet spot for risk/reward

Conviction Level: HIGH
Last Updated: March 2024
Next Review: Q2 2024 earnings cycle`,
              },
            ],
          },
          {
            id: "conv-2",
            type: "conviction",
            label: "Semiconductor Leadership",
            documentTitle: "Semiconductor Leadership Thesis",
            documentId: "DOC-2024-SEMI-v1.8",
            chunks: [
              {
                id: "chunk-1",
                content: `Global semiconductor supply chain dynamics favor integrated 
device manufacturers (IDMs) with advanced node capabilities.

Key Investment Themes:
• Leading-edge node scarcity (sub-5nm)
• Geopolitical reshoring tailwinds
• AI/ML compute demand inflection

Target Companies: ASML, TSMC, Samsung Electronics
Conviction Level: HIGH`,
              },
            ],
          },
          {
            id: "upload-1",
            type: "upload",
            label: "portfolio.pdf",
            documentTitle: "Client Portfolio Holdings",
            documentId: "UPLOAD-2024-03-15-portfolio.pdf",
            chunks: [
              {
                id: "chunk-1",
                content: `Portfolio Summary (as of March 2024)

Holdings:
NVDA - NVIDIA Corp - 8.2%
MSFT - Microsoft Corp - 7.5%
ASML - ASML Holding - 5.1%
GOOGL - Alphabet Inc - 6.8%
AMZN - Amazon.com Inc - 4.2%
META - Meta Platforms - 3.9%
TSM - Taiwan Semiconductor - 3.5%
AAPL - Apple Inc - 4.1%
JPM - JPMorgan Chase - 2.8%
V - Visa Inc - 2.4%
UNH - UnitedHealth Group - 2.2%
XOM - Exxon Mobil - 1.8%

Total Equity Exposure: 52.5%
Cash & Equivalents: 12.3%
Fixed Income: 35.2%`,
              },
            ],
          },
        ]}
      />

      {/* Follow-up user message */}
      <UserMessage content="Yes, show me the rebalancing opportunities" />

      {/* Assistant message with loading state */}
      <AssistantMessage
        reasoningSteps={[
          {
            id: "1",
            type: "list_documents",
            status: "done",
            label: "Listing documents...",
            result: "Found 8 conviction documents",
          },
          {
            id: "2",
            type: "search_convictions",
            status: "loading",
            label: "Analyzing position weights...",
          },
        ]}
        content=""
      />
    </div>
  )
}
