"use client"

import { cn } from "@/lib/utils"

interface SuggestedQuery {
  id: string
  text: string
  isOutOfScope?: boolean
}

const suggestedQueries: SuggestedQuery[] = [
  {
    id: "1",
    text: "O que é um CDB e como funciona?",
  },
  {
    id: "2",
    text: "Compare CDB e CRA: tributação e garantias",
  },
  {
    id: "3",
    text: "How is cryptocurrency taxed in Brazil?",
  },
]

interface ChatEmptyStateProps {
  onQuerySelect?: (query: string) => void
}

export function ChatEmptyState({ onQuerySelect }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="flex max-w-xl flex-col items-center text-center">
        {/* Logo / Wordmark */}
        <div className="mb-6">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Decade
          </h1>
          <div className="mt-1 h-1 w-12 mx-auto rounded-full bg-primary" />
        </div>

        {/* Tagline */}
        <p className="text-lg font-medium text-foreground/90">
          Ask anything about Decade&apos;s investment convictions
        </p>    

        {/* Suggested Query Chips - 2x2 Grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 w-full">
          {suggestedQueries.map((query) => (
            <button
              key={query.id}
              onClick={() => onQuerySelect?.(query.text)}
              className={cn(
                "group relative rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200",
                "bg-secondary/50 border-border hover:bg-secondary hover:border-primary/30",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background",
                query.isOutOfScope && "opacity-60"
              )}
            >
              <span className="text-foreground/80 group-hover:text-foreground transition-colors">
                {query.text}
              </span>
              {query.isOutOfScope && (
                <span className="absolute -top-2 -right-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
                  out of scope
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer Note */}
        <p className="mt-8 text-xs text-muted-foreground/70">
          Responds in your language · Sources always cited
        </p>
      </div>
    </div>
  )
}
