'use client';

import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';

export function DropZone({
  onFiles,
  children,
}: {
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  // Counter tracks nested enter/leave events from child elements.
  const counter = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    counter.current += 1;
    if (counter.current === 1) setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    counter.current -= 1;
    if (counter.current === 0) setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    counter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-2 z-40 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/90 pointer-events-none">
          <Upload className="w-10 h-10 text-blue-400 mb-3" />
          <p className="text-sm font-medium text-blue-600">Drop files here</p>
          <p className="text-xs text-blue-400 mt-1">PDF, .xlsx, .xls — max 25 MB each</p>
        </div>
      )}
      {children}
    </div>
  );
}
