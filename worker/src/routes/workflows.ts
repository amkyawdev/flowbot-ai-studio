import { Hono } from 'hono';
import type { Env, PublicWorkflow, WorkflowRow } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe, slugify, pageParams } from '../utils';
import { validateGraph } from '@flowbot/shared';
import type { WorkflowGraph } from '@flowbot/shared';
import { randomId } from '../crypto';
import { enqueueExecution } from '../engine/runner';

export const workflowRoutes = new Hono<AppEnv>();
workflowRoutes.use('/workflows*', authMiddleware);

function toPublic(row: WorkflowRow): PublicWorkflow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    graph: parseJsonSafe<WorkflowGraph>(row.graph_json, { nodes: [], edges: [] }),
    version: row.version,
    status: row.status,
    webhookPath: row.webhook_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

workflowRoutes.get('/workflows', async (c) => {
  const app = c.get('app');
  const { limit, offset } = pageParams(new URL(c.req.url));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
  ).bind(app.workspace.id, limit, offset).all<WorkflowRow>();
  const { results: count } = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM workflows WHERE workspace_id = ?',
  ).bind(app.workspace.id).all<{ n: number }>();
  return jsonResponse({ workflows: results.map(toPublic), total: count[0]?.n ?? 0 });
});

workflowRoutes.get('/workflows/:id', async (c) => {
  const app = c.get('app');
  const row = await c.env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).first<WorkflowRow>();
  if (!row) return jsonResponse({ error: 'Workflow not found' }, 404);
  return jsonResponse({ workflow: toPublic(row) });
});

workflowRoutes.post('/workflows', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim() || 'Untitled workflow';
  const initial: WorkflowGraph = { nodes: [], edges: [] };
  const id = `wf_${randomId()}`;
  await c.env.DB.prepare(
    `INSERT INTO workflows (id, workspace_id, name, description, graph_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, app.workspace.id, name, String(body?.description || ''), JSON.stringify(initial), app.user.id).run();
  return jsonResponse({ workflow: { id, name, description: '', graph: initial, version: 1, status: 'draft' as const, webhookPath: null } }, 201);
});

workflowRoutes.patch('/workflows/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<WorkflowRow>();
  if (!existing) return jsonResponse({ error: 'Workflow not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name;
  const description = body?.description !== undefined ? String(body.description) : existing.description;
  const graph = body?.graph !== undefined ? parseJsonSafe<WorkflowGraph>(JSON.stringify(body.graph), existing ? JSON.parse(existing.graph_json) : { nodes: [], edges: [] }) : undefined;
  const graphJson = graph !== undefined ? JSON.stringify(graph) : existing.graph_json;
  const status = body?.status !== undefined ? String(body.status) : existing.status;

  // Assign a secret webhook path when the graph contains a webhook trigger.
  let webhookPath = existing.webhook_path;
  if (graph !== undefined) {
    const hasWebhookTrigger = graph.nodes.some((n) => n.type === 'webhookTrigger');
    if (hasWebhookTrigger && !existing.webhook_path) {
      webhookPath = `wh_${randomId("", 16)}`;
    } else if (!hasWebhookTrigger) {
      webhookPath = null;
    }
  }

  // If the graph changed, bump the version and archive a snapshot.
  let version = existing.version;
  if (graph !== undefined && graphJson !== existing.graph_json) {
    version = existing.version + 1;
    await c.env.DB.prepare(
      'INSERT INTO workflow_versions (id, workflow_id, version, graph_json, note) VALUES (?, ?, ?, ?, ?)',
    ).bind(`wv_${randomId()}`, existing.id, existing.version, existing.graph_json, 'Auto-save').run();
  }

  await c.env.DB.prepare(
    `UPDATE workflows SET name = ?, description = ?, graph_json = ?, version = ?, status = ?, webhook_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).bind(name, description, graphJson, version, status, webhookPath, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM workflows WHERE id = ?').bind(id).first<WorkflowRow>();
  return jsonResponse({ workflow: toPublic(updated!) });
});

workflowRoutes.delete('/workflows/:id', async (c) => {
  const app = c.get('app');
  const res = await c.env.DB.prepare('DELETE FROM workflows WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).run();
  if (res.meta.changes === 0) return jsonResponse({ error: 'Workflow not found' }, 404);
  return jsonResponse({ ok: true });
});

workflowRoutes.get('/workflows/:id/versions', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.workflow_id, v.version, v.note, v.created_at
     FROM workflow_versions v
     JOIN workflows w ON w.id = v.workflow_id
     WHERE v.workflow_id = ? AND w.workspace_id = ?
     ORDER BY v.version DESC LIMIT 50`,
  ).bind(c.req.param('id'), app.workspace.id).all();
  return jsonResponse({ versions: results });
});

// Run a workflow. Synchronous for quick runtimes by default; enqueue when async.
workflowRoutes.post('/workflows/:id/run', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<WorkflowRow>();
  if (!row) return jsonResponse({ error: 'Workflow not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const input = body?.input || {};
  const asyncMode = body?.async === true;

  const graph = parseJsonSafe<WorkflowGraph>(row.graph_json, { nodes: [], edges: [] });
  const issues = validateGraph(graph);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return jsonResponse({ error: 'Workflow validation failed', issues: errors }, 422);

  const executionId = `ex_${randomId()}`;
  const started = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO executions (id, workspace_id, workflow_id, status, trigger_type, input_json, started_at)
     VALUES (?, ?, ?, 'running', 'manual', ?, ?)`,
  ).bind(executionId, app.workspace.id, id, JSON.stringify(input), started).run();

  if (asyncMode) {
    await enqueueExecution(c.env, { workspaceId: app.workspace.id, executionId, workflowId: id, input, triggerType: 'manual' });
    return jsonResponse({ executionId, status: 'queued' }, 202);
  }

  // Synchronous execution within the request.
  const { runWorkflowInWorker } = await import('../engine/runner');
  await runWorkflowInWorker(c.env, {
    workspaceId: app.workspace.id,
    workflowId: id,
    executionId,
    input,
    triggerType: 'manual',
  });
  const exec = await c.env.DB.prepare('SELECT * FROM executions WHERE id = ?').bind(executionId).first<import('../types').ExecutionRow>();
  return jsonResponse({ execution: exec });
});