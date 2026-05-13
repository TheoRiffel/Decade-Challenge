'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { ChatArea } from '@/components/chat-area'

export default function ChatPage() {
  // Actual File objects for the current submission (read by customFetch)
  const pendingFilesRef = useRef<File[]>([])
  // File names for the user message chip (associated by message ID in the effect below)
  const pendingNames = useRef<string[] | null>(null)
  // Suggestion query waiting for input state to settle before auto-submitting
  const pendingSuggestion = useRef<string | null>(null)
  // Stable map of user message ID → attached file names (drives attachment chips in ChatArea)
  const [attachmentsByMsgId, setAttachmentsByMsgId] = useState(new Map<string, string[]>())
  // X-Request-Id captured from response headers, mapped to the assistant message that follows
  const pendingRequestId = useRef<string | null>(null)
  const [traceIdByMsgId, setTraceIdByMsgId] = useState(new Map<string, string>())

  // ── Custom fetch: converts to multipart when files are pending ────────────
  const customFetch = useCallback<typeof globalThis.fetch>(
    async (input, init) => {
      const files = pendingFilesRef.current
      pendingFilesRef.current = [] // consume immediately so retries don't re-attach
      if (files.length === 0) return globalThis.fetch(input, init)

      const rawBody = (init?.body as string | null | undefined) ?? '{}'
      const jsonBody = JSON.parse(rawBody) as { messages?: unknown }

      const formData = new FormData()
      formData.append('messages', JSON.stringify(jsonBody.messages ?? []))
      for (const file of files) formData.append('files', file)

      const { 'Content-Type': _ct, ...restHeaders } = (
        (init?.headers ?? {}) as Record<string, string>
      )

      return globalThis.fetch(input, {
        method: 'POST',
        body: formData,
        headers: restHeaders,
        signal: init?.signal,
        credentials: init?.credentials,
      })
    },
    [],
  )

  const {
    messages,
    input,
    setInput,
    handleSubmit: chatHandleSubmit,
    data,
    status,
    error,
  } = useChat({
    api: '/api/chat',
    fetch: customFetch,
    onResponse: (response) => {
      pendingRequestId.current = response.headers.get('x-request-id')
    },
    onFinish: (message) => {
      if (pendingRequestId.current) {
        const traceId = pendingRequestId.current
        pendingRequestId.current = null
        setTraceIdByMsgId((prev) => {
          if (prev.has(message.id)) return prev
          const next = new Map(prev)
          next.set(message.id, traceId)
          return next
        })
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // ── Associate pending file names with the new user message ID ────────────
  useEffect(() => {
    if (!pendingNames.current) return
    const latestUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!latestUser) return
    const names = pendingNames.current
    pendingNames.current = null
    setAttachmentsByMsgId((prev) => {
      if (prev.has(latestUser.id)) return prev
      const next = new Map(prev)
      next.set(latestUser.id, names)
      return next
    })
  }, [messages])

  // ── Auto-submit once input settles to the pending suggestion ─────────────
  useEffect(() => {
    if (pendingSuggestion.current === null) return
    if (input !== pendingSuggestion.current) return
    pendingSuggestion.current = null
    chatHandleSubmit(
      { preventDefault: () => {} } as unknown as React.FormEvent<HTMLFormElement>,
    )
  }, [input, chatHandleSubmit])

  // ── Called by ChatInputWithUpload Send button / Enter key ─────────────────
  const handleSubmit = useCallback(
    (files: File[]) => {
      if (!input.trim() && files.length === 0) return
      pendingFilesRef.current = files
      if (files.length > 0) {
        pendingNames.current = files.map((f) => f.name)
      }
      chatHandleSubmit(
        { preventDefault: () => {} } as unknown as React.FormEvent<HTMLFormElement>,
      )
    },
    [input, chatHandleSubmit],
  )

  // ── Called by ChatEmptyState suggestion chips ─────────────────────────────
  const handleSuggestionSelect = useCallback(
    (query: string) => {
      if (isLoading) return
      pendingSuggestion.current = query
      setInput(query)
    },
    [isLoading, setInput],
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ChatArea
        messages={messages}
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        error={error}
        onSuggestionSelect={handleSuggestionSelect}
        data={data as unknown[] | undefined}
        attachmentsByMsgId={attachmentsByMsgId}
        traceIdByMsgId={traceIdByMsgId}
      />
    </div>
  )
}
