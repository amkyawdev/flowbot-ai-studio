import { Hono } from 'hono';
import type { Env, QueueMessage } from './types';
import type { AppEnv } from './utils';
import { corsHeaders, securityHeaders } from './utils';
import { authRoutes } from './routes/auth';
import { workflowRoutes } from './routes/workflows';
import { executionRoutes } from './routes/executions';
import { botRoutes } from './routes/bots';
import { credentialRoutes } from './routes/credentials';
import { integrationRoutes } from './routes/integrations';
import { agentRoutes } from './routes/agents';
import { settingRoutes } from './routes/settings';
import { dashboardRoutes } from './routes/dashboard';
import { chatRoutes, purgeOldPublicMessages } from './routes/chat';
import { inboundWebhook } from './routes/inbound';
import { telegramWebhookHandler } from './telegram/webhook';
import { runWorkflowInWorker } from './engine/runner';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const baseHeaders = { ...corsHeaders(c.env, origin), ...securityHeaders() };
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders });
  }
  await next();
  for (const [k, v] of Object.entries(baseHeaders) as Array<[string, string]>) {
    c.header(k, v);
  }
});

app.get('/api/health', (c) => c.json({ ok: true, service: 'flowbot-ai-studio', ts: new Date().toISOString() }));

app.route('/api', authRoutes);
app.route('/api', workflowRoutes);
app.route('/api', executionRoutes);
app.route('/api', botRoutes);
app.route('/api', credentialRoutes);
app.route('/api', integrationRoutes);
app.route('/api', agentRoutes);
app.route('/api', settingRoutes);
app.route('/api', dashboardRoutes);
app.route('/api', chatRoutes);

// Public inbound paths (no auth): webhook triggers + Telegram updates.
app.post('/api/in/webhook/:path', inboundWebhook);
app.get('/api/in/webhook/:path', inboundWebhook);
app.put('/api/in/webhook/:path', inboundWebhook);
app.post('/api/in/telegram/:secret', telegramWebhookHandler);

// Unknown API routes → JSON 404. Everything else → serve the PWA (SPA).
app.notFound(async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const headers = new Headers(res.headers);
    // Fingerprinted build assets are immutable; HTML must revalidate.
    if (url.pathname.startsWith('/assets/')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  return c.json({ error: 'Not found' }, 404);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeOldPublicMessages(env));
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    for (const msg of batch.messages) {
      const m = msg.body as QueueMessage;
      try {
        if (m.kind === 'execute-workflow') {
          await runWorkflowInWorker(env, {
            workspaceId: m.workspaceId,
            workflowId: m.workflowId,
            executionId: m.executionId,
            input: m.input ?? {},
            triggerType: m.triggerType ?? 'manual',
          });
        }
      } catch (e) {
        console.error('queue consumer error', e);
      }
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>;

export type { Env };