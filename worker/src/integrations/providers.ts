/** AI provider adapters: OpenAI-compatible, Google Gemini, Anthropic. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  provider: 'openai' | 'gemini' | 'anthropic';
  /** base URL override for OpenAI-compatible providers (OpenAI, Groq, OpenRouter, etc.) */
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface ChatResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

export async function chatCompletion(req: ChatRequest): Promise<ChatResult> {
  switch (req.provider) {
    case 'openai': return openaiCompat(req);
    case 'gemini': return gemini(req);
    case 'anthropic': return anthropic(req);
    default: throw new Error(`Unsupported provider: ${req.provider}`);
  }
}

async function openaiCompat(req: ChatRequest): Promise<ChatResult> {
  const base = (req.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/,'');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
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

async function gemini(req: ChatRequest): Promise<ChatResult> {
  const base = (req.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/,'');
  // Map roles: system -> "user" prefixed instruction (Gemini has no system role).
  const contents = req.messages.map((m, i) => {
    if (m.role === 'system') {
      return { role: 'user', parts: [{ text: `System instruction: ${m.content}` }] };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
  });
  const res = await fetch(`${base}/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

async function anthropic(req: ChatRequest): Promise<ChatResult> {
  const base = (req.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/,'');
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
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
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${(data as any)?.error?.message || res.statusText}`);
  const text = data?.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
  return {
    text,
    usage: data?.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens, totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined,
  };
}

/** Simple embeddings via an OpenAI-compatible endpoint (used by Zilliz search/insert). */
export async function embedTexts(req: { apiKey: string; baseUrl?: string; model?: string; inputs: string[] }): Promise<number[][]> {
  const base = (req.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/,'');
  const model = req.model ?? 'text-embedding-3-small';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}` },
    body: JSON.stringify({ model, input: req.inputs }),
  });
  const data = await res.json().catch(() => null) as { error?: { message?: string }; data?: { embedding?: number[] }[] } | null;
  if (!res.ok) throw new Error(`Embeddings API error (${res.status}): ${data?.error?.message || res.statusText}`);
  return (data?.data ?? []).map((d) => d.embedding ?? []);
}