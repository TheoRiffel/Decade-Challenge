"use client"

import { Plus, MessageSquare, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const recentConversations = [
  { id: 1, title: "NVIDIA Q4 2024 Earnings Analysis", date: "2 hours ago" },
  { id: 2, title: "Tesla Supply Chain Deep Dive", date: "Yesterday" },
  { id: 3, title: "Fed Interest Rate Impact on Tech", date: "Yesterday" },
  { id: 4, title: "Apple Vision Pro Market Outlook", date: "2 days ago" },
  { id: 5, title: "Semiconductor Sector Overview", date: "3 days ago" },
  { id: 6, title: "Amazon AWS Growth Projections", date: "1 week ago" },
  { id: 7, title: "Microsoft AI Strategy Review", date: "1 week ago" },
  { id: 8, title: "Meta Metaverse Investments", date: "2 weeks ago" },
]

export function ChatSidebar() {
  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">D</span>
        </div>
        <span className="text-xl font-semibold tracking-tight text-sidebar-foreground">
          Decade
        </span>
      </div>

      {/* New Conversation Button */}
      <div className="p-4">
        <Button className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Search conversations...</span>
        </div>
      </div>

      {/* Conversations List */}
      <div className="px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recent
        </span>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {recentConversations.map((conversation) => (
            <button
              key={conversation.id}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
            >
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {conversation.title}
                </p>
                <p className="text-xs text-muted-foreground">{conversation.date}</p>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Bottom Branding */}
      <div className="border-t border-border p-4">
        <p className="text-center text-xs text-muted-foreground">
          Powered by Decade Research
        </p>
      </div>
    </aside>
  )
}
