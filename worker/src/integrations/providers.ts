/** AI provider adapters: OpenAI-compatible (OpenAI/Groq/OpenRouter/custom), Gemini, Anthropic, Cloudflare Workers AI. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ProviderId =
  | 'openai'
  | 'openai-compatible'
  | 'groq'
  | 'openrouter'
  | 'gemini'
  | 'anthropic'
  | 'cloudflare';

/** Minimal surface of the Cloudflare `env.AI` binding (keeps this module testable). */
export interface WorkersAI {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface ChatRequest {
  provider: ProviderId;
  /** base URL override for OpenAI-compatible providers. */
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  /** Extra headers (server-side only; never log these). */
  headers?: Record<string, string>;
  /** Cloudflare Workers AI binding, required for provider 'cloudflare'. */
  ai?: WorkersAI;
}

export interface ChatResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/** Provider metadata used by the UI/API and connection tests. */
export const PROVIDER_DEFAULTS: Record<string, { kind: 'openai' | 'gemini' | 'anthropic' | 'cloudflare'; baseUrl?: string; defaultModel: string; label: string }> = {
  openai: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', label: 'OpenAI' },
  groq: { kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.1-8b-instant', label: 'Groq' },
  openrouter: { kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', label: 'OpenRouter' },
  'openai-compatible': { kind: 'openai', defaultModel: 'gpt-4o-mini', label: 'Custom OpenAI-compatible' },
  gemini: { kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.0-flash', label: 'Google Gemini' },
  anthropic: { kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-haiku-latest', label: 'Anthropic' },
  cloudflare: { kind: 'cloudflare', defaultModel: '@cf/meta/llama-3.1-8b-instruct', label: 'Cloudflare Workers AI' },
};

export function resolveProvider(provider: string): { kind: 'openai' | 'gemini' | 'anthropic' | 'cloudflare'; baseUrl?: string; defaultModel: string } {
  const meta = PROVIDER_DEFAULTS[provider];
  if (!meta) throw new Error(`Unsupported provider: ${provider}`);
  return { kind: meta.kind, baseUrl: meta.baseUrl, defaultModel: meta.defaultModel };
}

export async function chatCompletion(req: ChatRequest): Promise<ChatResult> {
  const meta = resolveProvider(req.provider);
  switch (meta.kind) {
    case 'openai': return openaiCompat(req, meta.baseUrl);
    case 'gemini': return gemini(req, meta.baseUrl);
    case 'anthropic': return anthropic(req, meta.baseUrl);
    case 'cloudflare': return cloudflare(req);
  }
}

async function openaiCompat(req: ChatRequest, defaultBase?: string): Promise<ChatResult> {
  const base = (req.baseUrl || defaultBase || '').replace(/\/+$/, '');
  if (!base) throw new Error('Base URL is required for this provider');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey ?? ''}`,
      ...(req.headers ?? {}),
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens,
      response_format: req.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    }),
  });
  const data = await res.json().catch(() => null) as { error?: { message?: string }; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null;
  if (!res.ok) throw new Error(`OpenAI-compatible API error (${res.status}): ${data?.error?.message || res.statusText}`);
  const content = data?.choices?.[0]?.message?.content ?? '';
  return {
    text: content,
    usage: data?.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }
      : undefined,
  };
}

async function gemini(req: ChatRequest, defaultBase?: string): Promise<ChatResult> {
  const base = (req.baseUrl || defaultBase || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  // Map roles: system -> "user" prefixed instruction (Gemini has no system role).
  const contents = req.messages.map((m) => {
    if (m.role === 'system') {
      return { role: 'user', parts: [{ text: `System instruction: ${m.content}` }] };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
  });
  const res = await fetch(`${base}/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey ?? '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(req.headers ?? {}) },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 1024,
        ...(req.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  const data = await res.json().catch(() => null) as { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } } | null;
  if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${data?.error?.message || res.statusText}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return {
    text,
    usage: data?.usageMetadata
      ? { promptTokens: data.usageMetadata.promptTokenCount, completionTokens: data.usageMetadata.candidatesTokenCount, totalTokens: data.usageMetadata.totalTokenCount }
      : undefined,
  };
}

async function anthropic(req: ChatRequest, defaultBase?: string): Promise<ChatResult> {
  const base = (req.baseUrl || defaultBase || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      ...(req.headers ?? {}),
    },
    body: JSON.stringify({
      model: req.model,
      system: system || undefined,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1024,
    }),
  });
  const data = await res.json().catch(() => null) as { error?: { message?: string }; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } } | null;
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${data?.error?.message || res.statusText}`);
  const text = data?.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
  return {
    text,
    usage: data?.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens, totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined,
  };
}

async function cloudflare(req: ChatRequest): Promise<ChatResult> {
  if (!req.ai) throw new Error('Cloudflare Workers AI binding is not configured (add [ai] binding = "AI" in wrangler.toml)');
  const model = req.model || '@cf/meta/llama-3.1-8b-instruct';
  const result = await req.ai.run(model, {
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 1024,
  }) as { response?: string; result?: { response?: string } } | null;
  const text = result?.response ?? result?.result?.response ?? '';
  return { text };
}

/** Simple embeddings via an OpenAI-compatible endpoint (used by Zilliz search/insert). */
export async function embedTexts(req: { apiKey: string; baseUrl?: string; model?: string; inputs: string[]; headers?: Record<string, string> }): Promise<number[][]> {
  const base = (req.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = req.model ?? 'text-embedding-3-small';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}`, ...(req.headers ?? {}) },
    body: JSON.stringify({ model, input: req.inputs }),
  });
  const data = await res.json().catch(() => null) as { error?: { message?: string }; data?: { embedding?: number[] }[] } | null;
  if (!res.ok) throw new Error(`Embeddings API error (${res.status}): ${data?.error?.message || res.statusText}`);
  return (data?.data ?? []).map((d) => d.embedding ?? []);
}
