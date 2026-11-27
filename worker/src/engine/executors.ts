import type { FlowNode } from '@flowbot/shared';
import { renderTemplate, getPath, setPath } from '@flowbot/shared';
import type { NodeExecutionContext, NodeExecutor, NodeExecutorResult } from '../types';
import { httpRequest } from '../integrations/http';
import { chatCompletion, embedTexts, resolveProvider } from '../integrations/providers';
import type { ProviderId } from '../integrations/providers';
import { TelegramClient } from '../integrations/telegram';
import * as zilliz from '../integrations/zilliz';

/** Build the template context from trigger input + prior node outputs. */
function buildCtx(ctx: NodeExecutionContext, node: FlowNode): Record<string, unknown> {
  return {
    input: ctx.input,
    payload: ctx.input,
    trigger: ctx.input,
    nodes: ctx.outputs,
    node: ctx.outputs[node.id],
  };
}

async function resolveString(ctx: NodeExecutionContext, node: FlowNode, template: unknown, fallbackInput?: unknown): Promise<string> {
  if (template !== undefined && template !== null && template !== '') {
    return renderTemplate(String(template), buildCtx(ctx, node));
  }
  if (fallbackInput !== undefined && fallbackInput !== null) return String(fallbackInput);
  return '';
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>, label: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn();
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`${label} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonish(v: string): Record<string, unknown> {
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Decode optional custom headers stored (encrypted) with a credential. */
function credentialHeaders(cred: Record<string, string>): Record<string, string> | undefined {
  if (!cred.headers) return undefined;
  const parsed = parseJsonish(cred.headers);
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
}

export const executors: Record<string, NodeExecutor> = {
  manualTrigger: {
    async execute(ctx, node) {
      return { outputs: { out: ctx.input } };
    },
  },

  webhookTrigger: {
    async execute(ctx, node) {
      const payload = ctx.input;
      return {
        outputs: {
          payload,
          headers: (payload?.__headers as Record<string, unknown>) ?? {},
          query: (payload?.__query as Record<string, unknown>) ?? {},
        },
      };
    },
  },

  telegramTrigger: {
    async execute(ctx, node) {
      const payload = ctx.input;
      return {
        outputs: {
          chatId: payload?.chat_id ? String(payload.chat_id) : '',
          text: payload?.text ?? '',
          from: payload?.from ?? {},
          message: payload ?? {},
        },
      };
    },
  },

  telegramSend: {
    async execute(ctx, node) {
      const cfg = node.data;
      const botId = String(cfg.bot || '');
      if (!botId) throw new Error('Telegram Send: no bot selected');
      const token = await ctx.vault.botToken(botId);
      const chatId = await resolveString(ctx, node, cfg.chatId, ctx.output('chatId'));
      const text = await resolveString(ctx, node, cfg.text, ctx.output('text'));
      if (!chatId) throw new Error('Telegram Send: no chat ID');
      const client = new TelegramClient({ token, apiUrl: ctx.env.TELEGRAM_API_URL });
      const result = await withTimeout(30_000, () => client.sendMessage(chatId, text), 'Telegram Send');
      return { outputs: { result: result as Record<string, unknown> } };
    },
  },

  aiAgent: {
    async execute(ctx, node) {
      const cfg = node.data;
      const agentId = String(cfg.agent || '');
      if (!agentId) throw new Error('AI Agent: no agent selected');
      const agent = await ctx.env.DB.prepare('SELECT * FROM agents WHERE id = ? AND workspace_id = ?')
        .bind(agentId, ctx.workspaceId).first() as Record<string, unknown> | null;
      if (!agent) throw new Error(`AI Agent not found: ${agentId}`);
      const input = await resolveString(ctx, node, cfg.input, ctx.output('input'));
      const credential = await ctx.vaultForAgent(agent);
      const agentBaseUrl = String((agent.base_url as string) || '');
      const agentProvider = String(agent.provider || 'openai') as ProviderId;
      const result = await withTimeout(90_000, () => chatCompletion({
        provider: agentProvider,
        apiKey: credential.apiKey || credential.token || '',
        baseUrl: agentBaseUrl || credential.baseUrl || undefined,
        model: String(agent.model || '') || resolveProvider(agentProvider).defaultModel,
        headers: credentialHeaders(credential),
        ai: ctx.env.AI,
        messages: [
          { role: 'system', content: String(agent.system_prompt || '') },
          { role: 'user', content: input || '' },
        ],
        temperature: Number(agent.temperature ?? 0.7),
        maxTokens: 1024,
      }), 'AI Agent');
      return { outputs: { text: result.text, usage: result.usage ?? {} } };
    },
  },

  openaiChat: {
    async execute(ctx, node) {
      const cfg = node.data;
      if (!cfg.credential) throw new Error('OpenAI Chat: no credential selected');
      const cred = await ctx.vault.get(String(cfg.credential));
      const prompt = await resolveString(ctx, node, cfg.prompt, ctx.output('prompt'));
      const sys = String(cfg.system || '').trim();
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (sys) messages.push({ role: 'system', content: renderTemplate(sys, buildCtx(ctx, node)) });
      messages.push({ role: 'user', content: prompt });
      const result = await withTimeout(90_000, () => chatCompletion({
        provider: 'openai',
        baseUrl: String(cfg.baseUrl || cred.baseUrl || '') || undefined,
        apiKey: cred.apiKey || cred.token || '',
        model: String(cfg.model || '') || 'gpt-4o-mini',
        headers: credentialHeaders(cred),
        ai: ctx.env.AI,
        messages,
        temperature: Number(cfg.temperature ?? 0.7),
        maxTokens: Number(cfg.maxTokens ?? 1024),
      }), 'OpenAI Chat');
      return { outputs: { text: result.text, usage: result.usage ?? {} } };
    },
  },

  gemini: {
    async execute(ctx, node) {
      const cfg = node.data;
      if (!cfg.credential) throw new Error('Gemini: no credential selected');
      const cred = await ctx.vault.get(String(cfg.credential));
      const prompt = await resolveString(ctx, node, cfg.prompt, ctx.output('prompt'));
      const sys = String(cfg.system || '').trim();
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (sys) messages.push({ role: 'system', content: renderTemplate(sys, buildCtx(ctx, node)) });
      messages.push({ role: 'user', content: prompt });
      const result = await withTimeout(90_000, () => chatCompletion({
        provider: 'gemini',
        apiKey: cred.apiKey || cred.token || '',
        model: String(cfg.model || 'gemini-2.0-flash'),
        headers: credentialHeaders(cred),
        ai: ctx.env.AI,
        messages,
        temperature: Number(cfg.temperature ?? 0.7),
      }), 'Gemini');
      return { outputs: { text: result.text, usage: result.usage ?? {} } };
    },
  },

  cloudflareAI: {
    async execute(ctx, node) {
      const cfg = node.data;
      const prompt = await resolveString(ctx, node, cfg.prompt, ctx.output('prompt'));
      const sys = String(cfg.system || '').trim();
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (sys) messages.push({ role: 'system', content: renderTemplate(sys, buildCtx(ctx, node)) });
      messages.push({ role: 'user', content: prompt });
      const result = await withTimeout(90_000, () => chatCompletion({
        provider: 'cloudflare',
        ai: ctx.env.AI,
        model: String(cfg.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
        messages,
        temperature: Number(cfg.temperature ?? 0.7),
        maxTokens: Number(cfg.maxTokens ?? 1024),
      }), 'Cloudflare AI');
      return { outputs: { text: result.text, usage: result.usage ?? {} } };
    },
  },

  httpRequest: {
    async execute(ctx, node) {
      const cfg = node.data;
      const url = await resolveString(ctx, node, cfg.url, ctx.output('url'));
      if (!url) throw new Error('HTTP Request: no URL');
      const headers = parseJsonish(renderTemplate(String(cfg.headers || '{}'), buildCtx(ctx, node)));
      let body: unknown;
      const bodyMode = String(cfg.body || 'none');
      if (cfg.bodyText && cfg.bodyText !== '') {
        const rendered = renderTemplate(String(cfg.bodyText), buildCtx(ctx, node));
        body = bodyMode === 'text' ? rendered : parseJsonish(rendered);
      } else if (ctx.output('body') !== undefined) {
        body = ctx.output('body');
      }
      const method = String(cfg.method || 'GET').toUpperCase();
      const timeoutMs = Number(cfg.timeout ?? 30) * 1000;
      const result = await withTimeout(timeoutMs, () => httpRequest({
        method,
        url,
        headers: Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k, String(v)])),
        body: method === 'GET' || bodyMode === 'none' ? undefined : body,
        timeoutMs,
      }), 'HTTP Request');
      return { outputs: { status: result.status, body: result.body, headers: result.headers } };
    },
  },

  "if": {
    async execute(ctx, node) {
      const cfg = node.data;
      const left = await resolveString(ctx, node, cfg.left, ctx.output('value'));
      const right = await resolveString(ctx, node, cfg.right, undefined);
      const op = String(cfg.operator || 'truthy');
      let truthy = false;
      const l = left;
      const r = right;
      switch (op) {
        case 'eq': truthy = l === r; break;
        case 'neq': truthy = l !== r; break;
        case 'gt': truthy = Number(l) > Number(r); break;
        case 'gte': truthy = Number(l) >= Number(r); break;
        case 'lt': truthy = Number(l) < Number(r); break;
        case 'lte': truthy = Number(l) <= Number(r); break;
        case 'contains': truthy = String(r) !== '' && String(l).includes(String(r)); break;
        case 'truthy': truthy = Boolean(l) && l !== '' && l !== 'false'; break;
        case 'empty': truthy = l === '' || l === undefined || l === null; break;
        default: truthy = Boolean(l);
      }
      return {
        outputs: {
          true: truthy ? l : undefined,
          false: !truthy ? l : undefined,
        },
      };
    },
  },

  switch: {
    async execute(ctx, node) {
      const cfg = node.data;
      const value = String(await resolveString(ctx, node, cfg.value, ctx.output('value')));
      const cases = String(cfg.cases || '').split(',').map((s) => s.trim()).filter(Boolean);
      const idx = cases.findIndex((c) => c === value);
      const outputs: Record<string, unknown> = { case0: undefined, case1: undefined, case2: undefined, default: undefined };
      if (idx >= 0 && idx < 3) {
        outputs[`case${idx}`] = value;
      } else {
        outputs.default = value;
      }
      return { outputs };
    },
  },

  set: {
    async execute(ctx, node) {
      const cfg = node.data;
      const mapping = parseJsonish(renderTemplate(String(cfg.mapping || '{}'), buildCtx(ctx, node)));
      const output = { ...((ctx.output('payload') as Record<string, unknown>) ?? {}) };
      for (const [path, value] of Object.entries(mapping)) {
        setPath(output, path, value);
      }
      return { outputs: { payload: output } };
    },
  },

  delay: {
    async execute(ctx, node) {
      const seconds = Math.max(0, Number(node.data.seconds || 0));
      if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1000));
      return { outputs: { out: ctx.output('value') } };
    },
  },

  zillizSearch: {
    async execute(ctx, node) {
      const cfg = node.data;
      const { zcfg, collection: defaultCollection } = zillizConfigFromEnv(ctx.env);
      const collection = String(cfg.collection || defaultCollection);
      const query = await resolveString(ctx, node, cfg.query, ctx.output('query'));
      let vec: number[] | null = null;
      if (cfg.embedCredential) {
        try {
          const cred = await ctx.vault.get(String(cfg.embedCredential));
          const vectors = await embedTexts({ apiKey: cred.apiKey || cred.token || '', baseUrl: cred.baseUrl, inputs: [query] });
          vec = vectors[0];
        } catch { vec = null; }
      }
      if (!vec || vec.length === 0) vec = zilliz.embedDummy(query, 1536);
      const results = await withTimeout(30_000, () => zilliz.search(zcfg, {
        collectionName: collection,
        vector: vec!,
        limit: Number(cfg.limit ?? 5),
        outputFields: ['text', 'source'],
      }), 'Zilliz Search');
      return { outputs: { results, count: results.length } };
    },
  },

  zillizInsert: {
    async execute(ctx, node) {
      const cfg = node.data;
      const { zcfg, collection: defaultCollection } = zillizConfigFromEnv(ctx.env);
      const collection = String(cfg.collection || defaultCollection);
      const text = await resolveString(ctx, node, cfg.text, ctx.output('text'));
      let vec: number[] | null = null;
      if (cfg.embedCredential) {
        try {
          const cred = await ctx.vault.get(String(cfg.embedCredential));
          const vectors = await embedTexts({ apiKey: cred.apiKey || cred.token || '', baseUrl: cred.baseUrl, inputs: [text] });
          vec = vectors[0];
        } catch { vec = null; }
      }
      const dim = vec?.length ?? 1536;
      if (!vec || vec.length === 0) vec = zilliz.embedDummy(text, dim);
      // Auto-create the collection on first insert (indexing dim from our vector).
      await ensureCollection(zcfg, collection, dim);
      const meta = (ctx.output('metadata') as Record<string, unknown> | undefined) ?? {};
      const result = await withTimeout(30_000, () => zilliz.insert(zcfg, {
        collectionName: collection,
        vectors: [{ vector: vec!, metadata: { ...meta, text, source: 'flowbot', ts: Date.now() } }],
      }), 'Zilliz Insert');
      return { outputs: { ids: result.ids, dim } };
    },
  },

  errorHandler: {
    async execute(ctx, node, opts) {
      const cfg = node.data;
      const action = String(cfg.action || 'continue');
      const err = opts?.errorHolder ?? ctx.output('error');
      if (action === 'stop') throw new Error(String(err || 'Workflow stopped by error handler'));
      return { outputs: { out: err } };
    },
  },
};

/**
 * Resolve Zilliz config strictly from Worker env bindings (never the client).
 * Throws a clear error when not configured so vector nodes degrade gracefully
 * instead of failing obscurely.
 */
export function zillizConfigFromEnv(
  env: Pick<import('../types').Env, 'ZILLIZ_ENDPOINT' | 'ZILLIZ_URL' | 'ZILLIZ_API_KEY' | 'ZILLIZ_TOKEN' | 'ZILLIZ_COLLECTION'>,
): {
  zcfg: { endpoint: string; token: string };
  collection: string;
} {
  const endpoint = String(env.ZILLIZ_ENDPOINT || env.ZILLIZ_URL || '').trim();
  const apiKey = String(env.ZILLIZ_API_KEY || env.ZILLIZ_TOKEN || '').trim();
  if (!endpoint || !apiKey) {
    throw new Error(
      'Zilliz is not configured. Set the Worker secrets ZILLIZ_ENDPOINT and ZILLIZ_API_KEY (then deploy or run `wrangler secret put`).',
    );
  }
  return {
    zcfg: { endpoint, token: apiKey },
    collection: String(env.ZILLIZ_COLLECTION || 'flowbot_chunks'),
  };
}

/** Create the Zilliz collection if it does not yet exist. */
async function ensureCollection(
  cfg: { endpoint: string; token: string },
  collection: string,
  dim: number,
): Promise<void> {
  const exists = await zilliz.describeCollection(cfg, collection);
  if (!exists) {
    await zilliz.createCollection(cfg, { name: collection, dim, metricType: 'IP' });
  }
}

export function getExecutor(type: string): NodeExecutor | undefined {
  return executors[type];
}

export { getPath };