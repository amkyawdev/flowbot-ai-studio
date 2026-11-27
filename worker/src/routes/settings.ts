import { Hono } from 'hono';
import type { Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe } from '../utils';

export const settingRoutes = new Hono<AppEnv>();
settingRoutes.use('/settings*', authMiddleware);

settingRoutes.get('/settings', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare('SELECT key, value_json FROM settings WHERE workspace_id = ?')
    .bind(app.workspace.id).all<{ key: string; value_json: string }>();
  const settings: Record<string, unknown> = {};
  for (const { key, value_json } of results) settings[key] = parseJsonSafe(value_json, null);
  const endpoint = String(c.env.ZILLIZ_ENDPOINT || c.env.ZILLIZ_URL || '');
  let zillizEndpointHost = '';
  try { zillizEndpointHost = endpoint ? new URL(endpoint).host : ''; } catch { zillizEndpointHost = endpoint; }
  const runtime = {
    zillizConfigured: Boolean(endpoint && (c.env.ZILLIZ_API_KEY || c.env.ZILLIZ_TOKEN)),
    zillizCollection: c.env.ZILLIZ_COLLECTION || 'flowbot_chunks',
    zillizEndpointHost,
    cloudflareAiAvailable: Boolean(c.env.AI),
  };
  return jsonResponse({ settings, runtime });
});

settingRoutes.put('/settings/:key', async (c) => {
  const app = c.get('app');
  const key = c.req.param('key');
  const body = await c.req.json().catch(() => ({}));
  const value = body?.value !== undefined ? body.value : body;
  await c.env.DB.prepare(
    `INSERT INTO settings (workspace_id, key, value_json, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT (workspace_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).bind(app.workspace.id, key, JSON.stringify(value)).run();
  return jsonResponse({ ok: true });
});

settingRoutes.get('/settings/about', (c) => c.json({
  developer: 'Aung Myo Kyaw',
  brand: 'AmkyawDev',
  email: 'aung.thuyrain.at449@gmail.com',
  location: 'Nay Pyi Taw, Myanmar',
  tiktok: 'https://www.tiktok.com/@amkyaw.dev1',
    version: '1.2.4',
}));