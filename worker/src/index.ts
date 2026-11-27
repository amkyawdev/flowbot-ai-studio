import { Hono } from 'hono';
import type { Env, QueueMessage } from './types';
import type { AppEnv } from './utils';
import { corsHeaders } from './utils';
import { authRoutes } from './routes/auth';
import { workflowRoutes } from './routes/workflows';
import { executionRoutes } from './routes/executions';
import { botRoutes } from './routes/bots';
import { credentialRoutes } from './routes/credentials';
import { integrationRoutes } from './routes/integrations';
import { agentRoutes } from './routes/agents';
import { settingRoutes } from './routes/settings';
import { dashboardRoutes } from './routes/dashboard';
import { inboundWebhook } from './routes/inbound';
import { telegramWebhookHandler } from './telegram/webhook';
import { runWorkflowInWorker } from './engine/runner';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(c.env) });
  }
  // Set CORS headers on the outgoing response for every non-OPTIONS request.
  await next();
  const headers = corsHeaders(c.env);
  for (const [k, v] of Object.entries(headers)) {
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

// Public inbound paths (no auth): webhook triggers + Telegram updates.
app.post('/api/in/webhook/:path', inboundWebhook);
app.get('/api/in/webhook/:path', inboundWebhook);
app.put('/api/in/webhook/:path', inboundWebhook);
app.post('/api/in/telegram/:secret', telegramWebhookHandler);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
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