import { Hono } from 'hono';
import type { Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe } from '../utils';
import { makeCredentialResolver } from '../engine/vault';
import { randomId } from '../crypto';

export const integrationRoutes = new Hono<AppEnv>();
integrationRoutes.use('/integrations*', authMiddleware);

integrationRoutes.get('/integrations', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare('SELECT * FROM integrations WHERE workspace_id = ? ORDER BY created_at ASC')
    .bind(app.workspace.id).all<{ id: string; workspace_id: string; name: string; type: string; config_json: string; secret_enc: string; status: string; last_tested_at: string | null; created_at: string; updated_at: string }>();
  const list = results.map((r) => {
    const cfg = parseJsonSafe<Record<string, unknown>>(r.config_json, {});
    // Never expose secrets in config.
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfg)) safe[k] = String(k).toLowerCase().includes('token') || String(k).toLowerCase().includes('key') || String(k).toLowerCase().includes('secret') ? '••••' : v;
    return { ...r, config: safe };
  });
  return jsonResponse({ integrations: list });
});

integrationRoutes.post('/integrations', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const type = String(body?.type || '').trim();
  const config = body?.config ?? {};
  const secret = body?.secret !== undefined ? { value: String(body.secret) } : {};
  if (!name || !type) return jsonResponse({ error: 'name and type are required' }, 400);

  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const secretEnc = secret.value ? await resolver.encrypt({ value: secret.value }) : '';
  const id = `it_${randomId()}`;
  await c.env.DB.prepare(
    'INSERT INTO integrations (id, workspace_id, name, type, config_json, secret_enc, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, app.workspace.id, name, type, JSON.stringify(config), secretEnc, 'pending').run();
  return jsonResponse({ integration: { id, name, type } }, 201);
});

integrationRoutes.patch('/integrations/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first();
  if (!existing) return jsonResponse({ error: 'Integration not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const config = body?.config !== undefined ? JSON.stringify(body.config) : existing.config_json;
  let secretEnc = existing.secret_enc as string;
  if (body?.secret) {
    const resolver = makeCredentialResolver(c.env, app.workspace.id);
    secretEnc = await resolver.encrypt({ value: String(body.secret) });
  }
  await c.env.DB.prepare(
    'UPDATE integrations SET config_json = ?, secret_enc = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?',
  ).bind(config, secretEnc, id).run();
  return jsonResponse({ ok: true });
});

integrationRoutes.delete('/integrations/:id', async (c) => {
  const app = c.get('app');
  const res = await c.env.DB.prepare('DELETE FROM integrations WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).run();
  if (res.meta.changes === 0) return jsonResponse({ error: 'Integration not found' }, 404);
  return jsonResponse({ ok: true });
});

/**
 * Live test for an integration. For MCP connectors this runs initialize +
 * tools/list against the remote server; for Zilliz it lists collections.
 */
integrationRoutes.post('/integrations/:id/test', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<{ id: string; name: string; type: string; config_json: string; secret_enc: string }>();
  if (!row) return jsonResponse({ error: 'Integration not found' }, 404);

  const cfg = parseJsonSafe<Record<string, unknown>>(row.config_json, {});
  let ok = false;
  let message = 'Test not available for this integration type';

  try {
    if (row.type === 'mcp') {
      const { testMcpConnection } = await import('../integrations/mcp');
      let token: string | undefined;
      if (row.secret_enc) {
        const resolver = makeCredentialResolver(c.env, app.workspace.id);
        token = JSON.parse(await resolver.decrypt(row.secret_enc)).value as string;
      }
      const res = await testMcpConnection({
        name: row.name,
        url: String(cfg.url || ''),
        authType: cfg.authType === 'bearer' ? 'bearer' : 'none',
        token,
        timeoutMs: 15_000,
      });
      ok = res.ok;
      message = res.ok ? `Connected — ${res.toolCount ?? 0} tools available` : (res.error || 'MCP connection failed');
    } else if (row.type === 'zilliz') {
      const { testConnection } = await import('../integrations/zilliz');
      let apiKey = c.env.ZILLIZ_API_KEY;
      let endpoint = String(cfg.endpoint || c.env.ZILLIZ_ENDPOINT || '');
      if (row.secret_enc) {
        const resolver = makeCredentialResolver(c.env, app.workspace.id);
        const secret = JSON.parse(await resolver.decrypt(row.secret_enc)) as { value?: string };
        if (secret.value) apiKey = secret.value;
      }
      if (!endpoint || !apiKey) {
        message = 'Zilliz is not configured — set ZILLIZ_ENDPOINT and ZILLIZ_API_KEY as Worker secrets.';
      } else {
        const res = await testConnection({ endpoint, token: apiKey });
        ok = res.ok;
        message = res.ok ? `Connected — ${res.collections?.length ?? 0} collections` : (res.message || 'Failed');
      }
    }
  } catch (e) {
    message = e instanceof Error ? e.message : 'Connection test failed';
  }

  await c.env.DB.prepare(
    'UPDATE integrations SET status = ?, last_tested_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?',
  ).bind(ok ? 'connected' : 'error', id).run();
  return jsonResponse({ ok, message });
});