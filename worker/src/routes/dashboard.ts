import { Hono } from 'hono';
import type { Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse } from '../utils';

export const dashboardRoutes = new Hono<AppEnv>();
dashboardRoutes.use('/dashboard*', authMiddleware);

dashboardRoutes.get('/dashboard', async (c) => {
  const app = c.get('app');
  const ws = app.workspace.id;
  const [workflowCount, botCount, execCount, successCount, recentExec, recentWorkflows] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM workflows WHERE workspace_id = ?').bind(ws).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM bots WHERE workspace_id = ?').bind(ws).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM executions WHERE workspace_id = ?').bind(ws).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM executions WHERE workspace_id = ? AND status = 'success'").bind(ws).first<{ n: number }>(),
    c.env.DB.prepare('SELECT * FROM executions WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 8').bind(ws).all(),
    c.env.DB.prepare('SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 5').bind(ws).all(),
  ]);
  return jsonResponse({
    stats: {
      workflows: workflowCount?.n ?? 0,
      bots: botCount?.n ?? 0,
      executions: execCount?.n ?? 0,
      successfulExecutions: successCount?.n ?? 0,
      successRate: execCount?.n ? Math.round(((successCount?.n ?? 0) / execCount.n) * 100) : 0,
    },
    recentExecutions: recentExec.results,
    recentWorkflows: recentWorkflows.results.map((w) => ({ id: w.id, name: w.name, status: w.status, graph: undefined })),
  });
});