import { Hono } from 'hono';
import { z } from 'zod';
import { runAgent } from '../agent/loop.js';
import { createTrace } from '../observability/trace.js';

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
 * POST /chat — JSON-only in v1 step 7.
 *
 * Body: { messages: [{ role: 'user'|'assistant', content }], requestId? }
 * Response: { response, validation, requestId }
 *
 * Multipart/form-data for uploads (ARCHITECTURE.md §15) lands in step 10.
 * Trace persistence to JSONL/Langfuse lands in step 8 — for now we log the
 * snapshot to stdout so each request is post-mortem'able.
 */
chatRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'invalid request', details: parsed.error.issues },
      400,
    );
  }

  const { messages, requestId } = parsed.data;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return c.json(
      { error: 'messages must include at least one user message' },
      400,
    );
  }

  const trace = createTrace({
    userMessage: lastUserMessage.content,
    ...(requestId !== undefined ? { requestId } : {}),
  });

  try {
    const result = await runAgent({ messages, trace });
    console.log(
      JSON.stringify({ event: 'chat', trace: result.trace }),
    );
    return c.json({
      response: result.response,
      validation: result.validation,
      requestId: trace.requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: 'chat_error',
        requestId: trace.requestId,
        error: message,
      }),
    );
    return c.json(
      { error: 'agent error', message, requestId: trace.requestId },
      500,
    );
  }
});
