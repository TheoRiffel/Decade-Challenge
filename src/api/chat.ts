import { Hono } from 'hono';

export const chatRouter = new Hono();

chatRouter.post('/', (c) => {
  return c.json({ error: 'not implemented' }, 501);
});
