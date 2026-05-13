"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  h2: ({ children }) => <h2 className="font-semibold text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="font-semibold text-foreground">{children}</h3>,
  ul: ({ children }) => (
    <ul className="list-disc pl-4 space-y-0.5 marker:text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 space-y-0.5 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-foreground/90">
      {children}
    </code>
  ),
  // Strip unsafe / unwanted elements
  img: () => null,
  a: ({ children }) => <>{children}</>,
  pre: ({ children }) => <>{children}</>,
}

export function MessageContent({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
