import { Hono } from 'hono';
import type { Env, CredentialRow } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe } from '../utils';
import { makeCredentialResolver } from '../engine/vault';
import { randomId } from '../crypto';

export const credentialRoutes = new Hono<AppEnv>();
credentialRoutes.use('/credentials*', authMiddleware);

const SECRET_KEYS = ['apiKey', 'token', 'secret', 'password', 'accessToken', 'bearer'];
const maskMeta = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = SECRET_KEYS.some((s) => k.toLowerCase().includes(s)) && v !== '' ? '••••••••' : v;
  }
  return out;
};

credentialRoutes.get('/credentials', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM credentials WHERE workspace_id = ? ORDER BY created_at ASC',
  ).bind(app.workspace.id).all<CredentialRow>();
  const list = results.map((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    meta: parseJsonSafe<Record<string, unknown>>(r.meta_json, { maskedKeys: [] }),
    createdAt: r.created_at,
  }));
  return jsonResponse({ credentials: list });
});

credentialRoutes.post('/credentials', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const provider = String(body?.provider || '').trim();
  const data = (body?.data && typeof body.data === 'object' ? body.data : {}) as Record<string, string>;
  if (!name || !provider) return jsonResponse({ error: 'name and provider are required' }, 400);

  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const dataEnc = await resolver.encrypt(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])));
  const id = `cr_${randomId()}`;
  await c.env.DB.prepare(
    'INSERT INTO credentials (id, workspace_id, name, provider, data_enc, meta_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, app.workspace.id, name, provider, dataEnc, JSON.stringify({ maskedKeys: Object.keys(data) })).run();
  return jsonResponse({ credential: { id, name, provider, meta: { maskedKeys: Object.keys(data) } } }, 201);
});

credentialRoutes.patch('/credentials/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM credentials WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<CredentialRow>();
  if (!existing) return jsonResponse({ error: 'Credential not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const merged = { ...parseJsonSafe<Record<string, string>>(await resolver.decrypt(existing.data_enc).catch(() => '{}'), {}), ...(body?.data ?? {}) };
  const dataEnc = await resolver.encrypt(merged);
  const name = body?.name !== undefined ? String(body.name) : existing.name;
  await c.env.DB.prepare(
    'UPDATE credentials SET name = ?, data_enc = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id = ?',
  ).bind(name, dataEnc, id).run();
  return jsonResponse({ ok: true });
});

credentialRoutes.delete('/credentials/:id', async (c) => {
  const app = c.get('app');
  const res = await c.env.DB.prepare('DELETE FROM credentials WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).run();
  if (res.meta.changes === 0) return jsonResponse({ error: 'Credential not found' }, 404);
  return jsonResponse({ ok: true });
});

/** Server-side connectivity test for a credential (never returns the secret). */
credentialRoutes.post('/credentials/:id/test', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM credentials WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<CredentialRow>();
  if (!row) return jsonResponse({ error: 'Credential not found' }, 404);
  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const decrypted = await resolver.decrypt(row.data_enc).catch((e) => { throw new Error(`Decrypt failed: ${e.message}`); });
  const data = parseJsonSafe<Record<string, string>>(decrypted, {});

  let ok = false;
  let message = 'Test not supported for this provider';
  try {
    if (row.provider === 'telegram') {
      const { TelegramClient } = await import('../integrations/telegram');
      const client = new TelegramClient({ token: data.token || data.apiKey, apiUrl: c.env.TELEGRAM_API_URL });
      const me = await client.getMe();
      ok = true;
      message = `Connected as @${me.username}`;
    } else if (row.provider === 'openai' || row.provider === 'groq' || row.provider === 'openrouter' || row.provider === 'anthropic') {
      const { chatCompletion } = await import('../integrations/providers');
      await chatCompletion({
        provider: row.provider === 'anthropic' ? 'anthropic' : 'openai',
        baseUrl: data.baseUrl || undefined,
        apiKey: data.apiKey || data.token || '',
        model: data.model || (row.provider === 'groq' ? 'llama-3.1-8b-instant' : row.provider === 'openrouter' ? 'openai/gpt-4o-mini' : 'gpt-4o-mini'),
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      });
      ok = true;
      message = `Connected to ${row.provider}`;
    } else if (row.provider === 'zilliz') {
      const { testConnection } = await import('../integrations/zilliz');
      const res = await testConnection({ endpoint: data.endpoint, token: data.token || data.apiKey });
      ok = res.ok;
      message = res.ok ? `Connected to Zilliz (${res.collections?.length ?? 0} collections)` : (res.message || 'Failed');
    }
  } catch (e) {
    message = e instanceof Error ? e.message : 'Connection test failed';
  }

  await c.env.DB.prepare(
    'UPDATE integrations SET last_tested_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'), status = ? WHERE id = ?',
  ).bind(ok ? 'connected' : 'error', row.id).run().catch(() => undefined);

  return jsonResponse({ ok, message });
});