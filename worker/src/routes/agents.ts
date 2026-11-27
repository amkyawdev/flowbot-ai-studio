import { Hono } from 'hono';
import type { Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe } from '../utils';
import { randomId } from '../crypto';

export const agentRoutes = new Hono<AppEnv>();
agentRoutes.use('/agents*', authMiddleware);

interface AgentRow {
  id: string; name: string; system_prompt: string; provider: string; model: string;
  temperature: number; memory_config_json: string; tools_json: string;
  structured_output_json: string | null; created_at: string; updated_at: string;
}

agentRoutes.get('/agents', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare('SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC')
    .bind(app.workspace.id).all<AgentRow>();
  const list = results.map((r) => ({
    id: r.id, name: r.name, systemPrompt: r.system_prompt, provider: r.provider, model: r.model,
    temperature: r.temperature, memoryConfig: parseJsonSafe(r.memory_config_json, {}),
    tools: parseJsonSafe(r.tools_json, []), structuredOutput: r.structured_output_json ? parseJsonSafe(r.structured_output_json, null) : null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
  return jsonResponse({ agents: list });
});

agentRoutes.post('/agents', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) return jsonResponse({ error: 'name is required' }, 400);
  const id = `ag_${randomId()}`;
  await c.env.DB.prepare(
    `INSERT INTO agents (id, workspace_id, name, system_prompt, provider, model, temperature, memory_config_json, tools_json, structured_output_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, app.workspace.id, name,
    String(body?.systemPrompt ?? ''),
    String(body?.provider ?? 'openai'),
    String(body?.model ?? ''),
    Number(body?.temperature ?? 0.7),
    JSON.stringify(body?.memoryConfig ?? {}),
    JSON.stringify(body?.tools ?? []),
    body?.structuredOutput !== undefined ? JSON.stringify(body.structuredOutput) : null,
  ).run();
  return jsonResponse({ agent: { id, name } }, 201);
});

agentRoutes.patch('/agents/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first();
  if (!existing) return jsonResponse({ error: 'Agent not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare(
    `UPDATE agents SET name = ?, system_prompt = ?, provider = ?, model = ?, temperature = ?, memory_config_json = ?, tools_json = ?, structured_output_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).bind(
    body?.name !== undefined ? String(body.name) : existing.name,
    body?.systemPrompt !== undefined ? String(body.systemPrompt) : existing.system_prompt,
    body?.provider !== undefined ? String(body.provider) : existing.provider,
    body?.model !== undefined ? String(body.model) : existing.model,
    body?.temperature !== undefined ? Number(body.temperature) : existing.temperature,
    body?.memoryConfig !== undefined ? JSON.stringify(body.memoryConfig) : existing.memory_config_json,
    body?.tools !== undefined ? JSON.stringify(body.tools) : existing.tools_json,
    body?.structuredOutput !== undefined ? (body.structuredOutput === null ? null : JSON.stringify(body.structuredOutput)) : existing.structured_output_json,
    id,
  ).run();
  return jsonResponse({ ok: true });
});

agentRoutes.delete('/agents/:id', async (c) => {
  const app = c.get('app');
  const res = await c.env.DB.prepare('DELETE FROM agents WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).run();
  if (res.meta.changes === 0) return jsonResponse({ error: 'Agent not found' }, 404);
  return jsonResponse({ ok: true });
});