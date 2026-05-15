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

const server = serve({ fetch: app.fetch, port: config.port });
// Disable Nagle's algorithm so each streamed token is sent immediately
// instead of being coalesced into larger TCP segments.
server.on('connection', (socket) => socket.setNoDelay(true));
console.log(
  `decade-conviction-assistant listening on :${config.port} (log level: ${config.logLevel})`,
);
