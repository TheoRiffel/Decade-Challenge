"use client"

import { X, FileText, Upload, Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SourceChunk {
  id: string
  content: string
}

interface SourceDocument {
  id: string
  title: string
  documentId: string
  type: "conviction" | "upload"
  chunks: SourceChunk[]
}

interface SourcePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: SourceDocument | null
  loading?: boolean
}

function ChunkCard({
  chunk,
  index,
  total,
}: {
  chunk: SourceChunk
  index: number
  total: number
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs text-muted-foreground">
        Chunk {index + 1} of {total}
      </span>
      <div className="rounded-lg bg-[#0a0f1e] border border-border p-4">
        <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 leading-relaxed">
          {chunk.content}
        </pre>
      </div>
    </div>
  )
}

export function SourcePanel({ open, onOpenChange, source, loading = false }: SourcePanelProps) {
  if (!source) return null

  const isConviction = source.type === "conviction"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[480px] sm:max-w-[480px] bg-[#0d1526] border-l border-border p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 space-y-3">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-lg font-semibold text-foreground truncate">
                {source.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground font-mono">
                {source.documentId}
              </SheetDescription>
            </div>
          </div>
          <Badge
            className={cn(
              "w-fit text-xs font-normal",
              isConviction
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            )}
          >
            {isConviction ? (
              <>
                <FileText className="h-3 w-3 mr-1" />
                Conviction Document
              </>
            ) : (
              <>
                <Upload className="h-3 w-3 mr-1" />
                Uploaded File
              </>
            )}
          </Badge>
        </SheetHeader>

        {/* Body - Scrollable Chunks */}
        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 pb-6">
            {loading ? (
              <div className="flex items-center gap-2 pt-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading chunks…</p>
              </div>
            ) : source.chunks.length === 0 ? (
              <p className="pt-4 text-sm text-muted-foreground">
                No chunks found for this source.
              </p>
            ) : (
              source.chunks.map((chunk, index) => (
                <ChunkCard
                  key={chunk.id}
                  chunk={chunk}
                  index={index}
                  total={source.chunks.length}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <SheetFooter className="px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center w-full">
            This was the evidence the agent used
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Demo component showing the panel in open state
export function SourcePanelDemo() {
  const demoSource: SourceDocument = {
    id: "conv-ai-infra",
    title: "AI Infrastructure Investment Thesis",
    documentId: "DOC-2024-AI-INFRA-v2.3",
    type: "conviction",
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
  }

  return (
    <SourcePanel
      open={true}
      onOpenChange={() => {}}
      source={demoSource}
    />
  )
}
