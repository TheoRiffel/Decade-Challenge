import { Hono } from 'hono';

/**
 * Per ARCHITECTURE.md §15, file uploads come in via multipart on POST /chat.
 * This separate router exists for future upload-once / reference-by-id
 * flows; v1 leaves it as a not-implemented placeholder.
 */
export const uploadRouter = new Hono();

uploadRouter.post('/', (c) => {
  return c.json({ error: 'not implemented' }, 501);
});
