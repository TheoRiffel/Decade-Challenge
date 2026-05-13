import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { chatRouter } from './api/chat.js';
import { sourcesRouter } from './api/sources.js';
import { config } from './config.js';

const app = new Hono();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'decade-conviction-assistant' }),
);

app.route('/chat', chatRouter);
app.route('/sources', sourcesRouter);

serve({ fetch: app.fetch, port: config.port });
console.log(
  `decade-conviction-assistant listening on :${config.port} (log level: ${config.logLevel})`,
);
