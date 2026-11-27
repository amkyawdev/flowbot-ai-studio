import type { Context } from 'hono';
import type { Env, WorkflowRow } from '../types';
import { parseJsonSafe } from '../utils';
import { findTrigger, validateGraph } from '@flowbot/shared';
import { runWorkflowInWorker } from '../engine/runner';

/** Public webhook endpoint: /api/in/webhook/<path> → runs matching webhook-trigger workflow. */
export async function inboundWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
  const path = c.req.param('path');
  const wf = await c.env.DB.prepare('SELECT * FROM workflows WHERE webhook_path = ?').bind(path).first<WorkflowRow>();
  if (!wf) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const graph = parseJsonSafe<import('@flowbot/shared').WorkflowGraph>(wf.graph_json, { nodes: [], edges: [] });
  const trigger = findTrigger(graph);
  const issues = validateGraph(graph);
  if (!trigger || trigger.type !== 'webhookTrigger' || issues.some((i) => i.severity === 'error')) {
    return new Response(JSON.stringify({ error: 'Workflow not configured for webhooks' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Payload from body + query + headers.
  let body: unknown = null;
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await c.req.json().catch(() => null);
  } else {
    const text = await c.req.text().catch(() => '');
    if (text) body = text;
  }
  const query: Record<string, string> = {};
  for (const [k, v] of new URL(c.req.url).searchParams) query[k] = v;

  const input = {
    ...(body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : { body }),
    __body: body,
    __query: query,
    __headers: Object.fromEntries(c.req.raw.headers.entries()),
  };

  // Defer long work to the queue; respond immediately.
  const executionId = `ex_${crypto.randomUUID().replace(/-/g, '')}`;
  await c.env.DB.prepare(
    'INSERT INTO executions (id, workspace_id, workflow_id, status, trigger_type, input_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(executionId, wf.workspace_id, wf.id, 'queued', 'webhook', JSON.stringify(input), new Date().toISOString()).run();

  try {
    await runWorkflowInWorker(c.env, {
      workspaceId: wf.workspace_id,
      workflowId: wf.id,
      executionId,
      input,
      triggerType: 'webhook',
    });
  } catch (e) {
    await c.env.DB.prepare("UPDATE executions SET status = 'error', error_message = ? WHERE id = ?")
      .bind(e instanceof Error ? e.message : 'Unknown error', executionId).run();
  }

  return new Response(JSON.stringify({ ok: true, executionId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}