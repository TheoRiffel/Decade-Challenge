/**
 * Per ARCHITECTURE.md §15: in-memory upload registry, scoped to a single
 * request. Files are never persisted, never indexed.
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
  throw new Error('not implemented');
}
