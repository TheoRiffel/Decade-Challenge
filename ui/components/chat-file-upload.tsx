"use client"

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent, type KeyboardEvent } from "react"
import { Paperclip, Send, Upload, X, FileText, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface UploadedFile {
  id: string
  name: string
  size: number
  type: "pdf" | "excel"
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateFilename(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) return name
  const ext = name.split(".").pop() || ""
  const base = name.slice(0, name.length - ext.length - 1)
  const truncatedBase = base.slice(0, maxLength - ext.length - 4) + "..."
  return `${truncatedBase}.${ext}`
}

function getFileType(file: File): "pdf" | "excel" | null {
  const name = file.name.toLowerCase()
  if (name.endsWith(".pdf")) return "pdf"
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return "excel"
  return null
}

// Attachment Chip Component
function AttachmentChip({
  file,
  onRemove,
}: {
  file: UploadedFile
  onRemove: (id: string) => void
}) {
  const isPdf = file.type === "pdf"

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
        isPdf
          ? "bg-slate-500/20 text-slate-300 border border-slate-500/30"
          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
      )}
    >
      {isPdf ? (
        <FileText className="h-4 w-4 shrink-0" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate max-w-[120px]">{truncateFilename(file.name)}</span>
      <span className="text-xs opacity-70">{formatFileSize(file.size)}</span>
      <button
        onClick={() => onRemove(file.id)}
        className={cn(
          "rounded p-0.5 transition-colors",
          isPdf
            ? "hover:bg-slate-500/30"
            : "hover:bg-emerald-500/30"
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

interface ChatInputWithUploadProps {
  value?: string
  onChange?: (value: string) => void
  onSubmit?: (files: File[]) => void
  disabled?: boolean
}

// Main Chat Input with File Upload
export function ChatInputWithUpload({ value, onChange, onSubmit, disabled = false }: ChatInputWithUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [internalMessage, setInternalMessage] = useState("")

  // Parallel map of UploadedFile.id → actual File object for submission
  const rawFilesRef = useRef(new Map<string, File>())

  // Support both controlled and uncontrolled modes
  const message = value !== undefined ? value : internalMessage
  const setMessage = onChange || setInternalMessage
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const processFiles = useCallback((fileList: FileList) => {
    const validFiles: UploadedFile[] = []

    Array.from(fileList).forEach((file) => {
      const type = getFileType(file)
      if (type && files.length + validFiles.length < 3) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        validFiles.push({ id, name: file.name, size: file.size, type })
        rawFilesRef.current.set(id, file)
      }
    })

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles].slice(0, 3))
    }
  }, [files.length])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ""
    }
  }, [processFiles])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    rawFilesRef.current.delete(id)
  }, [])

  const handleSend = useCallback(() => {
    if (disabled) return
    if (!message.trim() && files.length === 0) return
    const actualFiles = files
      .map((f) => rawFilesRef.current.get(f.id))
      .filter((f): f is File => f !== undefined)
    onSubmit?.(actualFiles)
    setFiles([])
    rawFilesRef.current.clear()
  }, [disabled, message, files, onSubmit])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  return (
    <div
      className="border-t border-border p-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl">
        {/* Attachment Chips */}
        {files.length > 0 && !isDragging && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((file) => (
              <AttachmentChip key={file.id} file={file} onRemove={removeFile} />
            ))}
          </div>
        )}

        {/* Input Container */}
        <div
          className={cn(
            "relative rounded-xl border transition-all duration-200",
            isDragging
              ? "border-2 border-dashed border-primary bg-primary/5"
              : "border-border bg-card"
          )}
        >
          {/* Drag Over Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/90 backdrop-blur-sm">
              <div className="rounded-full bg-primary/20 p-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Drop PDF or Excel files here
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum 3 files
              </p>
            </div>
          )}

          {/* Default Input State */}
          <div className={cn("flex items-end gap-2 p-3", isDragging && "invisible")}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openFilePicker}
              disabled={disabled || files.length >= 3}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <div className="min-h-[40px] flex-1">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about any company, market, or investment thesis..."
                disabled={disabled}
                className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                rows={1}
              />
            </div>
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={disabled || (!message.trim() && files.length === 0)}
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Decade Research can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}
