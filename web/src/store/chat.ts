import { create } from 'zustand';
import { chatApi } from '@/api/client';
import type { ChatConversation, ChatConfig, ChatMessage } from '@/api/client';
import { prefersReducedMotion } from '@/lib/animations';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Split text into small reveal chunks (pure; used by the typewriter reveal). */
export function chunkText(text: string, size = 3): string[] {
  if (!text) return [];
  const step = Math.max(1, size);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) out.push(text.slice(i, i + step));
  return out;
}

/** Append a chunk to a specific message (pure). */
export function appendChunk(messages: ChatMessage[], id: string, chunk: string): ChatMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m));
}

interface ChatState {
  config: ChatConfig | null;
  conversations: ChatConversation[];
  activeId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  streamingId: string | null;
  error: string | null;
  search: string;

  provider: string;
  model: string;
  credentialId: string;
  systemPrompt: string;

  loadConfig: () => Promise<void>;
  loadConversations: (q?: string) => Promise<void>;
  newConversation: () => Promise<string | null>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string, archived: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  send: (content: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  setProvider: (provider: string) => void;
  setModel: (model: string) => void;
  setCredentialId: (id: string) => void;
  setSystemPrompt: (v: string) => void;
  setSearch: (v: string) => void;
  clearError: () => void;
}

let revealToken = 0;
let abortController: AbortController | null = null;

export const useChat = create<ChatState>((set, get) => ({
  config: null,
  conversations: [],
  activeId: null,
  messages: [],
  loading: false,
  sending: false,
  streamingId: null,
  error: null,
  search: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  credentialId: '',
  systemPrompt: '',

  async loadConfig() {
    try {
      const config = await chatApi.config();
      const firstCred = config.credentials.find((c) => config.providers.some((p) => p.id === c.provider));
      const provider = firstCred?.provider || (config.cloudflareAvailable ? 'cloudflare' : 'openai');
      const meta = config.providers.find((p) => p.id === provider);
      set({ config, provider, model: meta?.defaultModel || 'gpt-4o-mini', credentialId: firstCred?.id || '' });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load chat configuration' });
    }
  },

  async loadConversations(q) {
    set({ loading: true });
    try {
      const res = await chatApi.listConversations(q ?? get().search);
      set({ conversations: res.conversations, loading: false });
      if (!get().activeId && res.conversations.length > 0) {
        void get().selectConversation(res.conversations[0].id);
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load conversations' });
    }
  },

  async newConversation() {
    try {
      const res = await chatApi.createConversation();
      set((s) => ({ conversations: [res.conversation, ...s.conversations], activeId: res.conversation.id, messages: [], error: null }));
      return res.conversation.id;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create conversation' });
      return null;
    }
  },

  async selectConversation(id) {
    set({ activeId: id, loading: true, error: null, messages: [] });
    try {
      const res = await chatApi.messages(id);
      set({ messages: res.messages, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load messages' });
    }
  },

  async renameConversation(id, title) {
    const clean = title.trim();
    if (!clean) return;
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: clean } : c)) }));
    try { await chatApi.renameConversation(id, clean); }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Rename failed' }); }
  },

  async archiveConversation(id, archived) {
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
    if (get().activeId === id) set({ activeId: null, messages: [] });
    try { await chatApi.archiveConversation(id, archived); }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Archive failed' }); }
  },

  async deleteConversation(id) {
    set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) }));
    if (get().activeId === id) set({ activeId: null, messages: [] });
    try { await chatApi.deleteConversation(id); }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Delete failed' }); }
  },

  async send(content) {
    const text = content.trim();
    const { activeId, sending, provider, model, credentialId, systemPrompt } = get();
    if (!text || !activeId || sending) return;
    const token = ++revealToken;
    abortController = new AbortController();
    const userMsg: ChatMessage = { id: `local_u_${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() };
    const placeholder: ChatMessage = { id: `local_a_${Date.now()}`, role: 'assistant', content: '', createdAt: new Date().toISOString() };
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], sending: true, streamingId: placeholder.id, error: null }));

    try {
      const res = await chatApi.send(activeId, {
        content: text, provider, model, credentialId: credentialId || undefined, systemPrompt: systemPrompt || undefined,
      }, abortController.signal);
      set((s) => ({ messages: s.messages.map((m) => (m.id === userMsg.id ? res.userMessage : m)) }));
      await reveal(res.assistantMessage, placeholder.id, token, set, get);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      set((s) => ({
        sending: false, streamingId: null, error: e instanceof Error ? e.message : 'Message failed',
        messages: s.messages.filter((m) => m.id !== placeholder.id),
      }));
    }
  },

  stop() {
    revealToken += 1;
    abortController?.abort();
    const { streamingId } = get();
    set((s) => ({
      sending: false, streamingId: null,
      messages: s.messages.map((m) => (m.id === streamingId ? { ...m, content: m.content ? `${m.content} …` : 'Stopped.' } : m)),
    }));
  },

  async regenerate() {
    const { activeId, sending, provider, model, credentialId, systemPrompt, messages } = get();
    if (!activeId || sending) return;
    let lastAssistant = -1;
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'assistant') { lastAssistant = i; break; } }
    if (lastAssistant < 0) return;
    const token = ++revealToken;
    abortController = new AbortController();
    const placeholder: ChatMessage = { id: `local_r_${Date.now()}`, role: 'assistant', content: '', createdAt: new Date().toISOString() };
    set((s) => ({
      messages: s.messages.filter((_, i) => i !== lastAssistant).concat(placeholder),
      sending: true, streamingId: placeholder.id, error: null,
    }));
    try {
      const res = await chatApi.regenerate(activeId, {
        provider, model, credentialId: credentialId || undefined, systemPrompt: systemPrompt || undefined,
      }, abortController.signal);
      await reveal(res.assistantMessage, placeholder.id, token, set, get);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      set((s) => ({
        sending: false, streamingId: null, error: e instanceof Error ? e.message : 'Regenerate failed',
        messages: s.messages.filter((m) => m.id !== placeholder.id),
      }));
    }
  },

  setProvider(provider) {
    const meta = get().config?.providers.find((p) => p.id === provider);
    const cred = get().config?.credentials.find((c) => c.provider === provider);
    set({ provider, model: meta?.defaultModel || get().model, credentialId: cred?.id || '' });
  },
  setModel(model) { set({ model }); },
  setCredentialId(credentialId) { set({ credentialId }); },
  setSystemPrompt(systemPrompt) { set({ systemPrompt }); },
  setSearch(search) { set({ search }); },
  clearError() { set({ error: null }); },
}));

async function reveal(
  full: ChatMessage,
  placeholderId: string,
  token: number,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  const reduced = prefersReducedMotion();
  const chunks = reduced ? [full.content] : chunkText(full.content, 3);
  set((s) => ({ messages: s.messages.map((m) => (m.id === placeholderId ? { ...full, content: '' } : m)) }));
  for (const chunk of chunks) {
    if (token !== revealToken) return;
    if (!reduced) await sleep(16);
    set((s) => ({ messages: appendChunk(s.messages, full.id, chunk) }));
  }
  if (token !== revealToken) return;
  set({ sending: false, streamingId: null });
  // Refresh titles so the first message renames "New chat".
  if (get().conversations.some((c) => c.id === get().activeId && c.title === 'New chat')) {
    void get().loadConversations();
  }
}
