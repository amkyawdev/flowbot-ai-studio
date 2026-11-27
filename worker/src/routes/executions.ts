import { Hono } from 'hono';
import type { Env, ExecutionRow } from '../types';
import { AppEnv, authMiddleware, jsonResponse, pageParams } from '../utils';

export const executionRoutes = new Hono<AppEnv>();
executionRoutes.use('/executions*', authMiddleware);

executionRoutes.get('/executions', async (c) => {
  const app = c.get('app');
  const { limit, offset } = pageParams(new URL(c.req.url));
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM executions WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
  ).bind(app.workspace.id, limit, offset).all();
  return jsonResponse({ executions: results });
});

executionRoutes.get('/executions/:id', async (c) => {
  const app = c.get('app');
  const exec = await c.env.DB.prepare('SELECT * FROM executions WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).first<ExecutionRow>();
  if (!exec) return jsonResponse({ error: 'Execution not found' }, 404);
  const { results: logs } = await c.env.DB.prepare(
    'SELECT * FROM execution_logs WHERE execution_id = ? ORDER BY seq ASC',
  ).bind(exec.id).all();
  return jsonResponse({ execution: exec, logs });
});

executionRoutes.post('/executions/:id/stop', async (c) => {
  const app = c.get('app');
  const exec = await c.env.DB.prepare('SELECT * FROM executions WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).first<ExecutionRow>();
  if (!exec) return jsonResponse({ error: 'Execution not found' }, 404);
  if (exec.status === 'running') {
    await c.env.DB.prepare(
      "UPDATE executions SET status = 'stopped', finished_at = ?, duration_ms = ? WHERE id = ?",
    ).bind(new Date().toISOString(), Date.now() - new Date(exec.started_at).getTime(), exec.id).run();
  }
  return jsonResponse({ ok: true });
});