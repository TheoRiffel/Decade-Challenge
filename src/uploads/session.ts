import { randomUUID } from 'node:crypto';

/**
 * Per ARCHITECTURE.md §15: in-memory upload registry, scoped to a single
 * request. Files are never persisted, never indexed.
 *
 * Flat shape — ParsedContent fields are inlined so the tool layer reads
 * ParsedUpload directly without importing the parsing layer.
 */
export type ParsedUpload = {
  fileId: string;
  filename: string;
  mimeType: string;
  content: string;
  truncated: boolean;
};

export interface UploadSession {
  add(upload: Omit<ParsedUpload, 'fileId'>): ParsedUpload;
  get(fileId: string): ParsedUpload | undefined;
  list(): ParsedUpload[];
}

export function createUploadSession(): UploadSession {
  const uploads = new Map<string, ParsedUpload>();

  return {
    add(upload) {
      const fileId = randomUUID();
      const entry: ParsedUpload = { fileId, ...upload };
      uploads.set(fileId, entry);
      return entry;
    },

    get(fileId) {
      return uploads.get(fileId);
    },

    list() {
      return [...uploads.values()];
    },
  };
}
