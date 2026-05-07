export type UploadInput = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type ParsedUploadContent = {
  filename: string;
  mimeType: string;
  content: string;
  truncated: boolean;
};

export async function parseUpload(
  _input: UploadInput,
): Promise<ParsedUploadContent> {
  throw new Error('not implemented');
}
