import { Hono } from 'hono';
import type { BotRow, Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe, pageParams } from '../utils';
import { makeCredentialResolver } from '../engine/vault';
import { randomId } from '../crypto';
import { createAndRunWorkflow } from '../engine/runner';
import { validateGraph } from '@flowbot/shared';

export const botRoutes = new Hono<AppEnv>();
botRoutes.use('/bots*', authMiddleware);

function toPublic(row: BotRow) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    webhookPath: row.webhook_path,
    webhookStatus: row.webhook_status,
    aiProvider: row.ai_provider,
    promptConfig: parseJsonSafe(row.prompt_config_json, {}),
    commands: parseJsonSafe(row.commands_json, []),
    menu: parseJsonSafe(row.menu_json, {}),
    keyboard: parseJsonSafe(row.keyboard_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

botRoutes.get('/bots', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare('SELECT * FROM bots WHERE workspace_id = ? ORDER BY created_at DESC')
    .bind(app.workspace.id).all<BotRow>();
  return jsonResponse({ bots: results.map(toPublic) });
});

botRoutes.get('/bots/:id', async (c) => {
  const app = c.get('app');
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).first<BotRow>();
  if (!row) return jsonResponse({ error: 'Bot not found' }, 404);
  return jsonResponse({ bot: toPublic(row) });
});

/** Create a bot from a BotFather token. Token never leaves the server. */
botRoutes.post('/bots', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim() || 'Telegram Bot';
  const token = String(body?.token || '').trim();
  if (!/^\d{6,10}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    return jsonResponse({ error: 'Invalid Telegram bot token. Create a bot via @BotFather and paste its token.' }, 400);
  }

  const { TelegramClient } = await import('../integrations/telegram');
  const client = new TelegramClient({ token, apiUrl: c.env.TELEGRAM_API_URL });
  let me;
  try {
    me = await client.getMe();
  } catch (e) {
    return jsonResponse({ error: `Token rejected by Telegram: ${e instanceof Error ? e.message : 'unknown'}` }, 400);
  }

  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const webhookPath = `tg-${randomId("", 8)}`;
  const webhookSecret = crypto.randomUUID().replace(/-/g, '');
  const id = `bot_${randomId()}`;
  await c.env.DB.prepare(
    `INSERT INTO bots (id, workspace_id, name, username, token_enc, webhook_secret_enc, webhook_path, webhook_status, ai_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'inactive', 'openai')`,
  ).bind(
    id,
    app.workspace.id,
    name,
    String(me.username || ''),
    await resolver.encrypt({ token }),
    await resolver.encrypt({ secret: webhookSecret }),
    webhookPath,
  ).run();
  return jsonResponse({ bot: toPublic((await c.env.DB.prepare('SELECT * FROM bots WHERE id = ?').bind(id).first<BotRow>())!) }, 201);
});

botRoutes.patch('/bots/:id', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<BotRow>();
  if (!row) return jsonResponse({ error: 'Bot not found' }, 404);
  const body = await c.req.json().catch(() => ({}));

  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const name = body?.name !== undefined ? String(body.name) : row.name;
  const aiProvider = body?.aiProvider !== undefined ? String(body.aiProvider) : row.ai_provider;
  const promptConfig = body?.promptConfig !== undefined ? JSON.stringify(body.promptConfig) : row.prompt_config_json;
  const commands = body?.commands !== undefined ? JSON.stringify(body.commands) : row.commands_json;
  const menu = body?.menu !== undefined ? JSON.stringify(body.menu) : row.menu_json;
  const keyboard = body?.keyboard !== undefined ? JSON.stringify(body.keyboard) : row.keyboard_json;

  let tokenEnc = row.token_enc;
  if (body?.token) {
    const { TelegramClient } = await import('../integrations/telegram');
    const client = new TelegramClient({ token: String(body.token), apiUrl: c.env.TELEGRAM_API_URL });
    try { await client.getMe(); } catch (e) { return jsonResponse({ error: `Invalid token: ${e instanceof Error ? e.message : 'unknown'}` }, 400); }
    tokenEnc = await resolver.encrypt({ token: String(body.token) });
  }

  await c.env.DB.prepare(
    `UPDATE bots SET name = ?, token_enc = ?, ai_provider = ?, prompt_config_json = ?, commands_json = ?, menu_json = ?, keyboard_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).bind(name, tokenEnc, aiProvider, promptConfig, commands, menu, keyboard, id).run();
  const updated = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ?').bind(id).first<BotRow>();
  return jsonResponse({ bot: toPublic(updated!) });
});

botRoutes.delete('/bots/:id', async (c) => {
  const app = c.get('app');
  const res = await c.env.DB.prepare('DELETE FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(c.req.param('id'), app.workspace.id).run();
  if (res.meta.changes === 0) return jsonResponse({ error: 'Bot not found' }, 404);
  return jsonResponse({ ok: true });
});

/** Register (or refresh) the Telegram webhook for a bot. */
botRoutes.post('/bots/:id/webhook', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<BotRow>();
  if (!row) return jsonResponse({ error: 'Bot not found' }, 404);
  const base = (c.env.APP_BASE_URL || `https://${c.req.header('host')}`).replace(/\/+$/, '');
  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const token = (await resolver.decrypt(row.token_enc).then((s) => JSON.parse(s).token).catch(() => ''));
  const secret = (await resolver.decrypt(row.webhook_secret_enc).then((s) => JSON.parse(s).secret).catch(() => ''));
  if (!token) return jsonResponse({ error: 'No token stored' }, 400);

  // Notify Telegram of our webhook endpoint.
  const webhookUrl = `${base}/api/in/telegram/${encodeURIComponent(secret)}`;
  const { TelegramClient } = await import('../integrations/telegram');
  const client = new TelegramClient({ token, apiUrl: c.env.TELEGRAM_API_URL });
  try {
    await client.setWebhook(webhookUrl, secret);
  } catch (e) {
    return jsonResponse({ error: `setWebhook failed: ${e instanceof Error ? e.message : 'unknown'}` }, 400);
  }
  await c.env.DB.prepare("UPDATE bots SET webhook_status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(id).run();
  if (Array.isArray(row.commands_json) || true) {
    const commands = parseJsonSafe<Array<{ command: string; description: string }>>(row.commands_json, []);
    if (commands.length > 0) {
      await client.setMyCommands(commands.map((cmd) => ({ command: cmd.command.replace(/^\//, '').slice(0, 32), description: cmd.description.slice(0, 256) }))).catch(() => undefined);
    }
  }
  return jsonResponse({ ok: true, webhookUrl, status: 'active' });
});

botRoutes.get('/bots/:id/webhook/status', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<BotRow>();
  if (!row) return jsonResponse({ error: 'Bot not found' }, 404);
  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const token = (await resolver.decrypt(row.token_enc).then((s) => JSON.parse(s).token).catch(() => ''));
  const { TelegramClient } = await import('../integrations/telegram');
  const client = new TelegramClient({ token, apiUrl: c.env.TELEGRAM_API_URL });
  try {
    const info = await client.getWebhookInfo();
    return jsonResponse({ info, status: info.url ? 'active' : 'inactive' });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unknown error' }, 400);
  }
});

/** Send a test message via the bot (from a chat ID you own). */
botRoutes.post('/bots/:id/test', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const chatId = String(body?.chatId || '').trim();
  const text = String(body?.text || '').trim() || 'Hello from FlowBot AI Studio ✨';
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE id = ? AND workspace_id = ?')
    .bind(id, app.workspace.id).first<BotRow>();
  if (!row) return jsonResponse({ error: 'Bot not found' }, 404);
  if (!chatId) return jsonResponse({ error: 'Provide a chatId (your Telegram chat ID)' }, 400);
  const resolver = makeCredentialResolver(c.env, app.workspace.id);
  const token = (await resolver.decrypt(row.token_enc).then((s) => JSON.parse(s).token).catch(() => ''));
  const { TelegramClient } = await import('../integrations/telegram');
  const client = new TelegramClient({ token, apiUrl: c.env.TELEGRAM_API_URL });
  try {
    const result = await client.sendMessage(chatId, text);
    await c.env.DB.prepare(
      'INSERT INTO bot_messages (id, bot_id, chat_id, direction, text, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(`bm_${randomId()}`, id, chatId, 'out', text, JSON.stringify(result)).run();
    return jsonResponse({ ok: true, result });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Failed to send' }, 400);
  }
});

botRoutes.get('/bots/:id/messages', async (c) => {
  const app = c.get('app');
  const id = c.req.param('id');
  const { limit, offset } = pageParams(new URL(c.req.url));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bot_messages WHERE bot_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  ).bind(id, limit, offset).all();
  return jsonResponse({ messages: results });
});