import { Hono } from 'hono';
import { z } from 'zod';
import { runAgent } from '../agent/loop.js';
import { config, fileParser } from '../config.js';
import { traceSink } from '../observability/index.js';
import { createTrace } from '../observability/trace.js';
import { FileParseError } from '../uploads/parse.js';
import { createUploadSession } from '../uploads/session.js';

/** 25 MB hard limit enforced in the API layer (parser-specific limits live in the parser). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const chatRequestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  requestId: z.string().optional(),
});

export const chatRouter = new Hono();

/**
 * POST /chat
 *
 * Accepts two content types:
 *   application/json      — { messages, requestId? }
 *   multipart/form-data   — messages (JSON string) + requestId? + file attachments
 *
 * File attachments become an UploadSession passed to the agent. The agent
 * accesses them via the parse_upload tool. Files are dropped after the
 * request completes (never persisted).
 */
chatRouter.post('/', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');

  // --- Parse request body ---
  let rawMessages: unknown;
  let requestId: string | undefined;
  let rawFiles: File[] = [];

  if (isMultipart) {
    let formData: Record<string, string | File | (string | File)[]>;
    try {
      formData = await c.req.parseBody({ all: true });
    } catch {
      return c.json({ error: 'failed to parse multipart body' }, 400);
    }

    const messagesField = formData['messages'];
    if (typeof messagesField !== 'string') {
      return c.json({ error: 'multipart body must include a "messages" field (JSON string)' }, 400);
    }
    try {
      rawMessages = JSON.parse(messagesField);
    } catch {
      return c.json({ error: '"messages" field must be valid JSON' }, 400);
    }

    const requestIdField = formData['requestId'];
    if (typeof requestIdField === 'string') requestId = requestIdField;

    const filesField = formData['files'];
    if (filesField !== undefined) {
      const candidates = Array.isArray(filesField) ? filesField : [filesField];
      rawFiles = candidates.filter((f): f is File => f instanceof File);
    }
  } else {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    const bodyObj = body as Record<string, unknown> | null;
    rawMessages = bodyObj?.['messages'];
    const rid = bodyObj?.['requestId'];
    if (typeof rid === 'string') requestId = rid;
  }

  // --- Validate messages ---
  const parsed = chatRequestSchema.safeParse({ messages: rawMessages, requestId });
  if (!parsed.success) {
    return c.json({ error: 'invalid request', details: parsed.error.issues }, 400);
  }

  const { messages } = parsed.data;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return c.json({ error: 'messages must include at least one user message' }, 400);
  }

  // --- Create trace early so file-parse latency is recorded ---
  const trace = createTrace({
    userMessage: lastUserMessage.content,
    ...(requestId !== undefined ? { requestId } : {}),
  });

  // --- Parse uploads ---
  const session = createUploadSession();

  for (const file of rawFiles) {
    if (file.size > MAX_FILE_BYTES) {
      return c.json(
        {
          error: `File "${file.name}" exceeds the 25 MB upload limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        },
        413,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadedFile = { filename: file.name, mimeType: file.type || 'application/octet-stream', bytes };

    if (!fileParser.canParse(uploadedFile)) {
      return c.json(
        { error: `Unsupported file type for "${file.name}". Supported: PDF, Excel (.xlsx/.xls).` },
        415,
      );
    }

    const t0 = performance.now();
    let parsedContent: Awaited<ReturnType<typeof fileParser.parse>>;
    try {
      parsedContent = await fileParser.parse(uploadedFile);
    } catch (err) {
      const reason = err instanceof FileParseError ? err.reason : 'extraction_failed';
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Could not parse "${file.name}": ${msg}`, reason }, 422);
    }

    trace.recordFileParse({
      filename: file.name,
      mimeType: uploadedFile.mimeType,
      parser: config.uploads.parser,
      latencyMs: Math.round(performance.now() - t0),
      truncated: parsedContent.truncated,
      ...(parsedContent.pageCount !== undefined ? { pageCount: parsedContent.pageCount } : {}),
      ...(parsedContent.sheetCount !== undefined ? { sheetCount: parsedContent.sheetCount } : {}),
    });

    session.add({
      filename: file.name,
      mimeType: uploadedFile.mimeType,
      content: parsedContent.text,
      truncated: parsedContent.truncated,
    });
  }

  // --- Run agent ---
  const hasUploads = session.list().length > 0;

  try {
    const result = await runAgent({
      messages,
      trace,
      ...(hasUploads ? { uploads: session } : {}),
    });
    await traceSink.write(result.trace);
    return c.json({
      response: result.response,
      validation: result.validation,
      requestId: trace.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const partialSnapshot = trace.finish(`<error: ${message}>`);
    await traceSink.write(partialSnapshot).catch(() => undefined);
    console.error(JSON.stringify({ event: 'chat_error', requestId: trace.requestId, error: message }));
    return c.json({ error: 'agent error', message, requestId: trace.requestId }, 500);
  }
});
