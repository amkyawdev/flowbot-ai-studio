import { Hono } from 'hono';
import type { Env } from '../types';
import { AppEnv, authMiddleware, jsonResponse, parseJsonSafe } from '../utils';
import { makeCredentialResolver } from '../engine/vault';
import { randomId } from '../crypto';
import { chatCompletion, resolveProvider, PROVIDER_DEFAULTS } from '../integrations/providers';
import type { ProviderId, ChatMessage } from '../integrations/providers';

export const chatRoutes = new Hono<AppEnv>();
chatRoutes.use('/conversations*', authMiddleware);
chatRoutes.use('/chat*', authMiddleware);
chatRoutes.use('/public*', authMiddleware);

interface ConversationRow {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  usage_json: string | null;
  created_at: string;
}

function toConversation(r: ConversationRow) {
  return {
    id: r.id,
    title: r.title,
    archived: Boolean(r.archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toMessage(r: ChatMessageRow) {
  return {
    id: r.id,
    role: r.role as 'user' | 'assistant' | 'system',
    content: r.content,
    usage: r.usage_json ? parseJsonSafe(r.usage_json, null) : null,
    createdAt: r.created_at,
  };
}

async function getConversation(env: Env, id: string, workspaceId: string, userId: string) {
  return env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND workspace_id = ? AND user_id = ?')
    .bind(id, workspaceId, userId).first<ConversationRow>();
}

async function resolveCredential(env: Env, workspaceId: string, provider: string, credentialId?: string) {
  const resolver = makeCredentialResolver(env, workspaceId);
  if (credentialId) return resolver.get(credentialId);
  const row = await env.DB.prepare(
    'SELECT id FROM credentials WHERE workspace_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1',
  ).bind(workspaceId, provider).first<{ id: string }>();
  return row ? resolver.get(row.id) : {};
}

function credentialHeaders(cred: Record<string, string>): Record<string, string> | undefined {
  if (!cred.headers) return undefined;
  const parsed = parseJsonSafe<Record<string, unknown>>(cred.headers, {});
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
}

/** Provider/model availability for the chat UI. Never returns secrets. */
chatRoutes.get('/chat/config', async (c) => {
  const app = c.get('app');
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, provider FROM credentials WHERE workspace_id = ? ORDER BY name ASC',
  ).bind(app.workspace.id).all<{ id: string; name: string; provider: string }>();
  const providers = Object.entries(PROVIDER_DEFAULTS).map(([id, meta]) => ({
    id,
    label: meta.label,
    defaultModel: meta.defaultModel,
    requiresCredential: id !== 'cloudflare',
  }));
  return jsonResponse({
    configured: results.length > 0 || Boolean(c.env.AI),
    cloudflareAvailable: Boolean(c.env.AI),
    providers,
    credentials: results,
  });
});

chatRoutes.get('/conversations', async (c) => {
  const app = c.get('app');
  const includeArchived = new URL(c.req.url).searchParams.get('archived') === '1';
  const q = (new URL(c.req.url).searchParams.get('q') || '').trim();
  const rows = await c.env.DB.prepare(
    `SELECT * FROM conversations
     WHERE workspace_id = ? AND user_id = ? ${includeArchived ? '' : 'AND archived = 0'}
       ${q ? 'AND title LIKE ?' : ''}
     ORDER BY updated_at DESC LIMIT 100`,
  ).bind(
    ...(q
      ? [app.workspace.id, app.user.id, `%${q}%`]
      : [app.workspace.id, app.user.id]),
  ).all<ConversationRow>();
  return jsonResponse({ conversations: rows.results.map(toConversation) });
});

chatRoutes.post('/conversations', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const id = `cv_${randomId()}`;
  const title = String(body?.title || 'New chat').trim().slice(0, 120) || 'New chat';
  await c.env.DB.prepare(
    'INSERT INTO conversations (id, workspace_id, user_id, title) VALUES (?, ?, ?, ?)',
  ).bind(id, app.workspace.id, app.user.id, title).run();
  return jsonResponse({
    conversation: { id, title, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }, 201);
});

chatRoutes.patch('/conversations/:id', async (c) => {
  const app = c.get('app');
  const conv = await getConversation(c.env, c.req.param('id'), app.workspace.id, app.user.id);
  if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const title = body?.title !== undefined ? String(body.title).trim().slice(0, 120) || conv.title : conv.title;
  const archived = body?.archived !== undefined ? (body.archived ? 1 : 0) : conv.archived;
  await c.env.DB.prepare(
    "UPDATE conversations SET title = ?, archived = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).bind(title, archived, conv.id).run();
  return jsonResponse({ ok: true });
});

chatRoutes.delete('/conversations/:id', async (c) => {
  const app = c.get('app');
  const conv = await getConversation(c.env, c.req.param('id'), app.workspace.id, app.user.id);
  if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').bind(conv.id),
    c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(conv.id),
  ]);
  return jsonResponse({ ok: true });
});

chatRoutes.get('/conversations/:id/messages', async (c) => {
  const app = c.get('app');
  const conv = await getConversation(c.env, c.req.param('id'), app.workspace.id, app.user.id);
  if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500',
  ).bind(conv.id).all<ChatMessageRow>();
  return jsonResponse({ messages: results.map(toMessage) });
});

chatRoutes.post('/conversations/:id/messages', async (c) => {
  const app = c.get('app');
  const conv = await getConversation(c.env, c.req.param('id'), app.workspace.id, app.user.id);
  if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const content = String(body?.content || '').trim();
  if (!content) return jsonResponse({ error: 'Message is required' }, 400);
  if (content.length > 8000) return jsonResponse({ error: 'Message is too long (max 8000 characters)' }, 400);

  const provider = String(body?.provider || 'openai') as ProviderId;
  let meta;
  try { meta = resolveProvider(provider); } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unsupported provider' }, 400);
  }

  let cred: Record<string, string> = {};
  try {
    cred = await resolveCredential(c.env, app.workspace.id, provider, body?.credentialId ? String(body.credentialId) : undefined);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Credential unavailable' }, 400);
  }
  if (provider !== 'cloudflare' && !cred.apiKey && !cred.token) {
    return jsonResponse({ error: `No API credential configured for ${meta.kind === 'gemini' ? 'Gemini' : provider}. Add one on the Credentials page.` }, 400);
  }

  const { results: history } = await c.env.DB.prepare(
    'SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 40',
  ).bind(conv.id).all<{ role: string; content: string }>();

  const messages: ChatMessage[] = [];
  const systemPrompt = String(body?.systemPrompt || '').trim();
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of history) messages.push({ role: m.role as ChatMessage['role'], content: m.content });
  messages.push({ role: 'user', content });

  let result;
  try {
    result = await chatCompletion({
      provider,
      baseUrl: cred.baseUrl || undefined,
      apiKey: cred.apiKey || cred.token || '',
      model: String(body?.model || '') || meta.defaultModel,
      headers: credentialHeaders(cred),
      ai: c.env.AI,
      messages,
      temperature: Number(body?.temperature ?? 0.7),
      maxTokens: Number(body?.maxTokens ?? 1024),
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'AI request failed' }, 502);
  }

  const userId = `cm_${randomId()}`;
  const assistantId = `cm_${randomId()}`;
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
    ).bind(userId, conv.id, content, now),
    c.env.DB.prepare(
      "INSERT INTO chat_messages (id, conversation_id, role, content, usage_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)",
    ).bind(assistantId, conv.id, result.text, result.usage ? JSON.stringify(result.usage) : null, new Date().toISOString()),
    c.env.DB.prepare(
      "UPDATE conversations SET title = CASE WHEN title = 'New chat' THEN ? ELSE title END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).bind(content.slice(0, 60), conv.id),
  ]);

  return jsonResponse({
    userMessage: { id: userId, role: 'user', content, createdAt: now },
    assistantMessage: { id: assistantId, role: 'assistant', content: result.text, usage: result.usage ?? null, createdAt: new Date().toISOString() },
  }, 201);
});

chatRoutes.post('/conversations/:id/regenerate', async (c) => {
  const app = c.get('app');
  const conv = await getConversation(c.env, c.req.param('id'), app.workspace.id, app.user.id);
  if (!conv) return jsonResponse({ error: 'Conversation not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const provider = String(body?.provider || 'openai') as ProviderId;
  let meta;
  try { meta = resolveProvider(provider); } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unsupported provider' }, 400);
  }
  const lastUser = await c.env.DB.prepare(
    "SELECT * FROM chat_messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
  ).bind(conv.id).first<ChatMessageRow>();
  if (!lastUser) return jsonResponse({ error: 'No user message to regenerate' }, 400);

  let cred: Record<string, string> = {};
  try {
    cred = await resolveCredential(c.env, app.workspace.id, provider, body?.credentialId ? String(body.credentialId) : undefined);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Credential unavailable' }, 400);
  }

  const { results: history } = await c.env.DB.prepare(
    'SELECT role, content FROM chat_messages WHERE conversation_id = ? AND created_at <= ? ORDER BY created_at ASC LIMIT 40',
  ).bind(conv.id, lastUser.created_at).all<{ role: string; content: string }>();
  const messages: ChatMessage[] = [];
  const systemPrompt = String(body?.systemPrompt || '').trim();
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of history) messages.push({ role: m.role as ChatMessage['role'], content: m.content });

  let result;
  try {
    result = await chatCompletion({
      provider,
      baseUrl: cred.baseUrl || undefined,
      apiKey: cred.apiKey || cred.token || '',
      model: String(body?.model || '') || meta.defaultModel,
      headers: credentialHeaders(cred),
      ai: c.env.AI,
      messages,
      temperature: Number(body?.temperature ?? 0.7),
      maxTokens: Number(body?.maxTokens ?? 1024),
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'AI request failed' }, 502);
  }

  const id = `cm_${randomId()}`;
  await c.env.DB.prepare(
    "INSERT INTO chat_messages (id, conversation_id, role, content, usage_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)",
  ).bind(id, conv.id, result.text, result.usage ? JSON.stringify(result.usage) : null, new Date().toISOString()).run();
  return jsonResponse({
    assistantMessage: { id, role: 'assistant', content: result.text, usage: result.usage ?? null, createdAt: new Date().toISOString() },
  }, 201);
});

// ----------------------------- Public chat -----------------------------

const PRESENCE_TTL_MS = 90_000;
export const PUBLIC_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Delete public chat messages older than 24h and stale presence rows. */
export async function purgeOldPublicMessages(env: Env): Promise<void> {
  const messageCutoff = new Date(Date.now() - PUBLIC_MESSAGE_TTL_MS).toISOString();
  await env.DB.prepare('DELETE FROM public_messages WHERE created_at < ?').bind(messageCutoff).run();
  const presenceCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await env.DB.prepare('DELETE FROM public_presence WHERE last_seen < ?').bind(presenceCutoff).run();
}

/** Throttle lazy purges so frequent polling does not run a DELETE every few seconds. */
async function maybePurge(env: Env): Promise<void> {
  try {
    if (await env.KV.get('public_purge_marker')) return;
    await env.KV.put('public_purge_marker', '1', { expirationTtl: 600 });
  } catch { /* KV optional */ }
  await purgeOldPublicMessages(env);
}

async function activeUsers(env: Env) {
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  const { results } = await env.DB.prepare(
    'SELECT user_id, display_name, last_seen FROM public_presence WHERE last_seen >= ? ORDER BY display_name ASC LIMIT 50',
  ).bind(cutoff).all<{ user_id: string; display_name: string; last_seen: string }>();
  return results.map((r) => ({ userId: r.user_id, displayName: r.display_name, lastSeen: r.last_seen }));
}

async function touchPresence(env: Env, userId: string, displayName: string) {
  await env.DB.prepare(
    `INSERT INTO public_presence (user_id, display_name, last_seen) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, last_seen = excluded.last_seen`,
  ).bind(userId, displayName, new Date().toISOString()).run();
}

chatRoutes.get('/public/messages', async (c) => {
  const app = c.get('app');
  await maybePurge(c.env);
  await touchPresence(c.env, app.user.id, app.user.displayName);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM public_messages ORDER BY created_at DESC LIMIT 100',
  ).all<{ id: string; user_id: string; display_name: string; content: string; created_at: string }>();
  const messages = results.reverse().map((r) => ({
    id: r.id, userId: r.user_id, displayName: r.display_name, content: r.content, createdAt: r.created_at,
  }));
  return jsonResponse({ messages, activeUsers: await activeUsers(c.env) });
});

chatRoutes.post('/public/messages', async (c) => {
  const app = c.get('app');
  const body = await c.req.json().catch(() => ({}));
  const content = String(body?.content || '').trim();
  if (!content) return jsonResponse({ error: 'Message is required' }, 400);
  if (content.length > 2000) return jsonResponse({ error: 'Message is too long (max 2000 characters)' }, 400);

  // KV requires expirationTtl >= 60s, so use a 2-second time bucket key instead.
  const bucket = Math.floor(Date.now() / 2000);
  const rateKey = `pub_rate:${app.user.id}:${bucket}`;
  if (await c.env.KV.get(rateKey)) {
    return jsonResponse({ error: 'Slow down — wait a moment before posting again.' }, 429);
  }
  await c.env.KV.put(rateKey, '1', { expirationTtl: 60 });

  const id = `pm_${randomId()}`;
  await maybePurge(c.env);
  await touchPresence(c.env, app.user.id, app.user.displayName);
  await c.env.DB.prepare(
    'INSERT INTO public_messages (id, user_id, display_name, content) VALUES (?, ?, ?, ?)',
  ).bind(id, app.user.id, app.user.displayName, content).run();
  return jsonResponse({
    message: { id, userId: app.user.id, displayName: app.user.displayName, content, createdAt: new Date().toISOString() },
    activeUsers: await activeUsers(c.env),
  }, 201);
});

chatRoutes.post('/public/presence', async (c) => {
  const app = c.get('app');
  await touchPresence(c.env, app.user.id, app.user.displayName);
  return jsonResponse({ activeUsers: await activeUsers(c.env) });
});

chatRoutes.get('/public/presence', async (c) => {
  return jsonResponse({ activeUsers: await activeUsers(c.env) });
});
