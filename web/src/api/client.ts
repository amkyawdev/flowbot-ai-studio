// Resolve the API base URL.
//  - If VITE_API_BASE_URL is set at build time, use it.
//  - Native (Capacitor Android/iOS) serves the app from https://localhost or
//    capacitor://localhost where no API exists → point at the deployed Worker.
//  - Web (served by the Worker itself) → same-origin ('') so /api works.
export const PROD_API_URL = 'https://flowbot-ai-studio.amkyaw-dev.workers.dev';

function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (env && env.trim() !== '') return env.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    const isNative =
      cap?.isNativePlatform?.() === true ||
      window.location.protocol === 'capacitor:' ||
      (window.location.hostname === 'localhost' && window.location.protocol === 'https:');
    if (isNative) return PROD_API_URL;
  }
  return '';
}

export const API_BASE = resolveApiBase();

export interface ApiError {
  status: number;
  error: string;
  issues?: unknown[];
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const token = localStorage.getItem('flowbot_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  let data: unknown = null;
  let parsed = false;
  try { data = await res.json(); parsed = true; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = (data as ApiError) || {};
    const e = new Error(err.error || `Request failed (${res.status})`) as Error & { status?: number; issues?: unknown[] };
    e.status = res.status;
    e.issues = err.issues;
    throw e;
  }
  if (!parsed) {
    // A 200 with a non-JSON body usually means the API host is wrong (the
    // WebView served index.html instead of JSON). Surface a clear error.
    throw new Error('Unexpected response from server. Please check your connection.');
  }
  return data as T;
}

export const authApi = {
  register: (body: { email: string; password: string; displayName?: string }) =>
    api('/api/auth/register', { method: 'POST', body, auth: false }),
  login: (body: { email: string; password: string }) =>
    api<{ token: string; user: { id: string; email: string; displayName: string }; workspace: { id: string } }>('/api/auth/login', { method: 'POST', body, auth: false }),
  me: () => api('/api/auth/me'),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
};

export const workflowsApi = {
  list: () => api<{ workflows: any[]; total: number }>('/api/workflows'),
  get: (id: string) => api<{ workflow: any }>(`/api/workflows/${id}`),
  create: (body: { name: string; description?: string }) => api<{ workflow: any }>('/api/workflows', { method: 'POST', body }),
  save: (id: string, body: Record<string, unknown>) => api<{ workflow: any }>(`/api/workflows/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/api/workflows/${id}`, { method: 'DELETE' }),
  run: (id: string, body: { input?: Record<string, unknown>; async?: boolean }) => api(`/api/workflows/${id}/run`, { method: 'POST', body }),
  versions: (id: string) => api<{ versions: any[] }>(`/api/workflows/${id}/versions`),
};

export const executionsApi = {
  list: () => api<{ executions: any[] }>('/api/executions'),
  get: (id: string) => api<{ execution: any; logs: any[] }>(`/api/executions/${id}`),
  stop: (id: string) => api(`/api/executions/${id}/stop`, { method: 'POST' }),
};

export const botsApi = {
  list: () => api<{ bots: any[] }>('/api/bots'),
  get: (id: string) => api<{ bot: any }>(`/api/bots/${id}`),
  create: (body: { name: string; token: string }) => api<{ bot: any }>('/api/bots', { method: 'POST', body }),
  save: (id: string, body: Record<string, unknown>) => api<{ bot: any }>(`/api/bots/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/api/bots/${id}`, { method: 'DELETE' }),
  webhook: (id: string) => api<{ ok: boolean; webhookUrl: string; status: string }>(`/api/bots/${id}/webhook`, { method: 'POST' }),
  webhookStatus: (id: string) => api<{ info: any; status: string }>(`/api/bots/${id}/webhook/status`),
  test: (id: string, body: { chatId: string; text?: string }) => api(`/api/bots/${id}/test`, { method: 'POST', body }),
  messages: (id: string) => api<{ messages: any[] }>(`/api/bots/${id}/messages`),
};

export const credentialsApi = {
  list: () => api<{ credentials: any[] }>('/api/credentials'),
  create: (body: { name: string; provider: string; data: Record<string, string> }) => api<{ credential: any }>('/api/credentials', { method: 'POST', body }),
  save: (id: string, body: Record<string, unknown>) => api(`/api/credentials/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/api/credentials/${id}`, { method: 'DELETE' }),
  test: (id: string) => api<{ ok: boolean; message: string }>(`/api/credentials/${id}/test`, { method: 'POST' }),
};

export const integrationsApi = {
  list: () => api<{ integrations: any[] }>('/api/integrations'),
  create: (body: { name: string; type: string; config?: Record<string, unknown>; secret?: string }) => api<{ integration: any }>('/api/integrations', { method: 'POST', body }),
  remove: (id: string) => api(`/api/integrations/${id}`, { method: 'DELETE' }),
  test: (id: string) => api<{ ok: boolean; message: string }>(`/api/integrations/${id}/test`, { method: 'POST' }),
};

export const agentsApi = {
  list: () => api<{ agents: any[] }>('/api/agents'),
  create: (body: Record<string, unknown>) => api<{ agent: any }>('/api/agents', { method: 'POST', body }),
  save: (id: string, body: Record<string, unknown>) => api(`/api/agents/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/api/agents/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  get: () => api<{
    settings: Record<string, unknown>;
    runtime?: { zillizConfigured: boolean; zillizCollection: string; zillizEndpointHost: string; cloudflareAiAvailable: boolean };
  }>('/api/settings'),
  put: (key: string, value: unknown) => api(`/api/settings/${key}`, { method: 'PUT', body: { value } }),
  about: () => api<Record<string, string>>('/api/settings/about'),
};

export const zillizApi = {
  status: () => api<{ configured: boolean; endpointHost: string; collection: string }>('/api/zilliz/status'),
  test: () => api<{ ok: boolean; message?: string; collections?: string[] }>('/api/zilliz/test', { method: 'POST' }),
};

export const dashboardApi = {
  get: () => api<{ stats: any; recentExecutions: any[]; recentWorkflows: any[] }>('/api/dashboard'),
};

// ----------------------------- Chat -----------------------------

export interface ChatConversation {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
  createdAt: string;
}

export interface ChatConfig {
  configured: boolean;
  cloudflareAvailable: boolean;
  providers: { id: string; label: string; defaultModel: string; requiresCredential: boolean }[];
  credentials: { id: string; name: string; provider: string }[];
}

export interface PublicMessage {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface ActiveUser {
  userId: string;
  displayName: string;
  lastSeen: string;
}

export interface SendChatBody {
  content: string;
  provider: string;
  model: string;
  credentialId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export const chatApi = {
  config: () => api<ChatConfig>('/api/chat/config'),
  listConversations: (q?: string) =>
    api<{ conversations: ChatConversation[] }>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createConversation: (title?: string) =>
    api<{ conversation: ChatConversation }>('/api/conversations', { method: 'POST', body: { title } }),
  renameConversation: (id: string, title: string) =>
    api(`/api/conversations/${id}`, { method: 'PATCH', body: { title } }),
  archiveConversation: (id: string, archived: boolean) =>
    api(`/api/conversations/${id}`, { method: 'PATCH', body: { archived } }),
  deleteConversation: (id: string) => api(`/api/conversations/${id}`, { method: 'DELETE' }),
  messages: (id: string) => api<{ messages: ChatMessage[] }>(`/api/conversations/${id}/messages`),
  send: (id: string, body: SendChatBody, signal?: AbortSignal) =>
    api<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(`/api/conversations/${id}/messages`, { method: 'POST', body, signal }),
  regenerate: (id: string, body: Omit<SendChatBody, 'content'>, signal?: AbortSignal) =>
    api<{ assistantMessage: ChatMessage }>(`/api/conversations/${id}/regenerate`, { method: 'POST', body, signal }),
};

export const publicApi = {
  messages: () => api<{ messages: PublicMessage[]; activeUsers: ActiveUser[] }>('/api/public/messages'),
  send: (content: string) =>
    api<{ message: PublicMessage; activeUsers: ActiveUser[] }>('/api/public/messages', { method: 'POST', body: { content } }),
  presence: () => api<{ activeUsers: ActiveUser[] }>('/api/public/presence', { method: 'POST' }),
};