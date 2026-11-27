import type { Context } from 'hono';
import type { BotRow, Env, WorkflowRow } from '../types';
import { makeCredentialResolver } from '../engine/vault';
import { parseJsonSafe } from '../utils';
import { timingSafeEqual } from '../crypto';
import { createAndRunWorkflow } from '../engine/runner';
import { findTrigger, validateGraph } from '@flowbot/shared';
import { TelegramClient } from '../integrations/telegram';

/** Inbound Telegram update — verified by the webhook secret_token. */
export async function telegramWebhookHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const secret = c.req.param('secret');
  const row = await c.env.DB.prepare('SELECT * FROM bots WHERE webhook_secret_enc IS NOT NULL').all<BotRow>();
  if (row.results.length === 0) return new Response('Not found', { status: 404 });

  // Find the bot whose decrypted webhook secret matches this URL.
  const resolver = makeCredentialResolver(c.env, '');
  let bot: BotRow | null = null;
  for (const r of row.results) {
    try {
      const data = JSON.parse(await resolver.decrypt(r.webhook_secret_enc)) as { secret?: string };
      const candidate = data.secret;
      if (candidate !== undefined && timingSafeEqual(candidate, String(secret))) { bot = r; break; }
    } catch { continue; }
  }
  if (!bot) return new Response('Not found', { status: 404 });

  // X-Telegram-Bot-Api-Secret-Token check (Telegram sends this on setWebhook).
  const sent = c.req.header('x-telegram-bot-api-secret-token') || '';
  if (sent) {
    try {
      const data = JSON.parse(await resolver.decrypt(bot.webhook_secret_enc)) as { secret?: string };
      if (!timingSafeEqual(data.secret || '', sent)) return new Response('Forbidden', { status: 403 });
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const update = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!update) return new Response('Bad request', { status: 400 });

  const callbackQuery = update.callback_query as Record<string, unknown> | undefined;
  const callbackData = callbackQuery?.data ? String(callbackQuery.data) : '';
  const callbackQueryMessage = callbackQuery?.message as Record<string, unknown> | undefined;
  const message = (update.message ?? update.edited_message ?? callbackQueryMessage) as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const chatId = chat?.id !== undefined ? String(chat.id) : '';
  const text = String(message?.text ?? callbackData ?? '');

  await c.env.DB.prepare(
    'INSERT INTO bot_messages (id, bot_id, chat_id, direction, text, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(`bm_${crypto.randomUUID().replace(/-/g, '')}`, bot.id, chatId, 'in', text, JSON.stringify(update)).run();

  // Find a workflow with a telegramTrigger bound to this bot.
  const workflows = await c.env.DB.prepare('SELECT * FROM workflows WHERE workspace_id = ?').bind(bot.workspace_id).all<WorkflowRow>();
  let consumed = false;
  for (const wf of workflows.results) {
    const graph = parseJsonSafe<import('@flowbot/shared').WorkflowGraph>(wf.graph_json, { nodes: [], edges: [] });
    const trigger = findTrigger(graph);
    if (trigger?.type !== 'telegramTrigger') continue;
    const botId = String(trigger.data?.bot || '');
    if (botId && botId !== bot.id) continue;
    const cmdFilter = String(trigger.data?.command || '');
    if (cmdFilter && !text.startsWith(cmdFilter)) continue;
    if (validateGraph(graph).some((i) => i.severity === 'error')) continue;

    await createAndRunWorkflow(c.env, {
      workspaceId: bot.workspace_id,
      workflowId: wf.id,
      input: { chat_id: chatId, text, from: message?.from ?? {}, callback_data: callbackData, bot_id: bot.id },
      triggerType: 'telegram',
    });
    consumed = true;
    // Acknowledge callback queries.
    if (callbackQuery?.id) {
      const { TelegramClient } = await import('../integrations/telegram');
      const data = JSON.parse(await resolver.decrypt(bot.token_enc)) as { token: string };
      const client = new TelegramClient({ token: data.token, apiUrl: c.env.TELEGRAM_API_URL });
      await client.answerCallbackQuery(String(callbackQuery.id)).catch(() => undefined);
    }
    break;
  }

  // Reply to user commands via the bot's prompt config when no workflow consumed it.
  if (!consumed && text) {
    await handleCommand(c, bot, chatId, text, resolver);
  }

  return new Response('OK');
}

async function handleCommand(
  c: Context<{ Bindings: Env }>,
  bot: BotRow,
  chatId: string,
  text: string,
  resolver: ReturnType<typeof makeCredentialResolver>,
): Promise<void> {
  try {
    const commands = parseJsonSafe<Array<{ command: string; description: string; reply: string }>>(bot.commands_json, []);
    const lower = text.trim().toLowerCase();
    const matched = commands.find((cmd) => {
      const c = String(cmd.command || '').toLowerCase().replace(/^\//, '');
      return lower === `/${c}` || lower === c;
    });

    let reply: string | null = null;
    if (matched?.reply) {
      reply = matched.reply;
    } else if (lower === '/start' || lower === 'start') {
      reply = `Hi! I'm ${bot.name}. Send /help to see what I can do.`;
    } else if (lower === '/help' || lower === 'help') {
      const cmds = commands.length ? commands.map((cmd) => `/${cmd.command} — ${cmd.description}`).join('\n') : 'No custom commands configured yet.';
      reply = `Available commands:\n${cmds}`;
    } else if (bot.prompt_config_json && booleablePromptReply(bot)) {
      // AI reply when a prompt config with an agent is set.
      reply = await aiReply(c, bot, text);
    }

    if (reply !== null) {
      const data = JSON.parse(await resolver.decrypt(bot.token_enc)) as { token: string };
      const client = new TelegramClient({ token: data.token, apiUrl: c.env.TELEGRAM_API_URL });
      await client.sendMessage(chatId, reply);
      await c.env.DB.prepare(
        'INSERT INTO bot_messages (id, bot_id, chat_id, direction, text) VALUES (?, ?, ?, ?, ?)',
      ).bind(`bm_${crypto.randomUUID().replace(/-/g, '')}`, bot.id, chatId, 'out', reply).run();
    }
  } catch (e) {
    console.error('handleCommand error', e);
  }
}

function booleablePromptReply(bot: BotRow): boolean {
  const cfg = parseJsonSafe<Record<string, unknown>>(bot.prompt_config_json, {});
  return Boolean(cfg.enabled && cfg.agent);
}

async function aiReply(
  c: Context<{ Bindings: Env }>,
  bot: BotRow,
  text: string,
): Promise<string | null> {
  try {
    const cfg = parseJsonSafe<Record<string, unknown>>(bot.prompt_config_json, {});
    const agentId = String(cfg.agent || '');
    if (!agentId) return null;
    const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ? AND workspace_id = ?')
      .bind(agentId, bot.workspace_id).first() as Record<string, unknown> | null;
    if (!agent) return null;
    const resolver = makeCredentialResolver(c.env, bot.workspace_id);
    let cred: Record<string, string> = {};
    const credId = agent.credential_id as string | undefined;
    if (credId) {
      cred = await resolver.get(String(credId));
    } else {
      const row = await c.env.DB.prepare(
        'SELECT id FROM credentials WHERE workspace_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1',
      ).bind(bot.workspace_id, String(agent.provider || 'openai')).first<{ id: string }>();
      if (row) cred = await resolver.get(row.id);
    }
    const { chatCompletion } = await import('../integrations/providers');
    const result = await chatCompletion({
      provider: String(agent.provider || 'openai') as 'openai' | 'gemini' | 'anthropic',
      apiKey: String(cred.apiKey || cred.token || ''),
      baseUrl: cred.baseUrl ? String(cred.baseUrl) : undefined,
      model: String(agent.model || ''),
      messages: [
        { role: 'system', content: String(agent.system_prompt || 'You are a helpful assistant.') },
        { role: 'user', content: text },
      ],
      temperature: Number(agent.temperature ?? 0.7),
      maxTokens: 1024,
    });
    return result.text || null;
  } catch (e) {
    console.error('aiReply error', e);
    return 'Sorry, I could not process that.';
  }
}