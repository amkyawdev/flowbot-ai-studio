import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Square, Plus, Search, Trash2, Archive, Pencil, Copy, RefreshCw, Settings2,
  Menu, Users, MessageSquare, Play, RotateCcw, Check, X, Bot, Globe,
} from 'lucide-react';
import { Sheet } from '@/components/ui';
import { Combobox } from '@/components/Combobox';
import { useApp } from '@/store/app';
import { useChat } from '@/store/chat';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { publicApi } from '@/api/client';
import type { ActiveUser, ChatMessage as ChatMsg, PublicMessage } from '@/api/client';
import { DEFAULT_PRESETS, loadCustomPresets, play, saveCustomPresets, validatePreset } from '@/lib/animations';
import type { AnimationPreset } from '@/lib/animations';
import { timeAgo } from '@flowbot/shared';
import { avatarFor } from '@/lib/avatars';

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  cloudflare: ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.3-70b-instruct', '@cf/mistral/mistral-7b-instruct'],
};

const AVATAR_COLORS = ['#38bdf8', '#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function Avatar({ name, size = 30, ai = false }: { name: string; size?: number; ai?: boolean }) {
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span
      className="chat-avatar"
      style={{
        width: size, height: size, fontSize: Math.max(10, size * 0.36),
        background: ai ? 'linear-gradient(135deg,var(--brand-deep),var(--cyan))' : `${color}26`,
        color: ai ? '#04121c' : color,
      }}
      aria-hidden
    >
      {ai ? <Bot size={Math.max(12, size * 0.5)} /> : initials(name)}
    </span>
  );
}

function UserAvatar({ userId, name, size = 30 }: { userId: string; name: string; size?: number }) {
  return (
    <img
      className="chat-avatar-img"
      src={avatarFor(userId || name)}
      width={size}
      height={size}
      alt=""
      title={name}
      loading="lazy"
    />
  );
}

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Assistant is typing">
      <i /><i /><i />
    </span>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPage() {
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const loadConfig = useChat((s) => s.loadConfig);
  const loadConversations = useChat((s) => s.loadConversations);

  useEffect(() => {
    void loadConfig();
    void loadConversations();
  }, [loadConfig, loadConversations]);

  const sidebar = <SidebarContent onPick={() => setMobileListOpen(false)} />;

  return (
    <div className="chat-page">
      <aside className="chat-sidebar" aria-label="Chat navigation">{sidebar}</aside>
      <section className="chat-main">
        <AiChat onOpenList={() => setMobileListOpen(true)} />
      </section>
      <Sheet open={mobileListOpen} onClose={() => setMobileListOpen(false)} title="Chats">
        {sidebar}
      </Sheet>
    </div>
  );
}

export function PublicChatPage() {
  return (
    <div className="chat-page chat-page-public">
      <section className="chat-main">
        <PublicChat />
      </section>
    </div>
  );
}

function SidebarContent({ onPick }: { onPick: () => void }) {
  const conversations = useChat((s) => s.conversations);
  const activeId = useChat((s) => s.activeId);
  const search = useChat((s) => s.search);
  const setSearch = useChat((s) => s.setSearch);
  const selectConversation = useChat((s) => s.selectConversation);
  const newConversation = useChat((s) => s.newConversation);
  const renameConversation = useChat((s) => s.renameConversation);
  const archiveConversation = useChat((s) => s.archiveConversation);
  const deleteConversation = useChat((s) => s.deleteConversation);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="chat-sidebar-inner">
      <div className="chat-sidebar-head">
        <span className="chat-brand"><MessageSquare size={17} /> Chat</span>
        <button className="btn-icon btn-ghost" aria-label="New chat" onClick={() => { void newConversation(); onPick(); }}>
          <Plus size={19} />
        </button>
      </div>

      <div className="chat-search">
        <Search size={15} aria-hidden />
        <input
          className="chat-search-input"
          placeholder="Search chats"
          value={search}
          aria-label="Search chats"
          onChange={(e) => { setSearch(e.target.value); void useChat.getState().loadConversations(e.target.value); }}
        />
      </div>

      <div className="section-title" style={{ margin: '12px 4px 6px' }}>Your chats</div>
      <div className="chat-convos">
        {conversations.length === 0 && <div className="small dim" style={{ padding: '8px 4px' }}>No conversations yet.</div>}
        {conversations.map((c) => (
          <div key={c.id} className={`chat-convo ${c.id === activeId ? 'active' : ''}`}>
            {renaming === c.id ? (
              <form
                className="chat-rename"
                onSubmit={(e) => { e.preventDefault(); void renameConversation(c.id, draft); setRenaming(null); }}
              >
                <input
                  className="chat-rename-input"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => setRenaming(null)}
                  aria-label="Conversation title"
                />
                <button type="submit" className="btn-icon btn-ghost" aria-label="Save title"><Check size={15} /></button>
              </form>
            ) : (
              <>
                <button className="chat-convo-main" onClick={() => { void selectConversation(c.id); onPick(); }}>
                  <span className="chat-convo-title">{c.title}</span>
                  <span className="chat-convo-sub">{timeAgo(c.updatedAt)}</span>
                </button>
                <div className="chat-convo-actions">
                  <button className="btn-icon btn-ghost" aria-label="Rename" onClick={() => { setRenaming(c.id); setDraft(c.title); }}><Pencil size={14} /></button>
                  <button className="btn-icon btn-ghost" aria-label="Archive" onClick={() => void archiveConversation(c.id, true)}><Archive size={14} /></button>
                  <button className="btn-icon btn-ghost" aria-label="Delete" style={{ color: 'var(--red)' }} onClick={() => { if (confirm('Delete this conversation?')) void deleteConversation(c.id); }}><Trash2 size={14} /></button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AiChat({ onOpenList }: { onOpenList: () => void }) {
  const store = useChat();
  const toast = useApp((s) => s.toast);
  const user = useApp((s) => s.user);
  const reduced = useReducedMotion();
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [animOpen, setAnimOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = store.messages;
  const activeTitle = store.conversations.find((c) => c.id === store.activeId)?.title || 'New chat';
  const providerMeta = store.config?.providers.find((p) => p.id === store.provider);
  const providerCreds = store.config?.credentials.filter((c) => c.provider === store.provider) ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, store.sending, reduced]);

  async function submit() {
    const text = input.trim();
    if (!text || store.sending) return;
    let id = store.activeId;
    if (!id) id = await useChat.getState().newConversation();
    if (!id) return;
    setInput('');
    try { await useChat.getState().send(text); }
    catch (e) { toast(e instanceof Error ? e.message : 'Message failed', 'error'); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  const configured = store.config?.configured !== false;

  return (
    <>
      <header className="chat-header">
        <button className="btn-icon btn-ghost chat-menu-btn" aria-label="Open chats" onClick={onOpenList}><Menu size={20} /></button>
        <div className="chat-title">
          <b>{activeTitle}</b>
          <span className="small dim">{providerMeta?.label || store.provider} · {store.model}</span>
        </div>
        <div className="chat-header-controls">
          <Combobox
            value={store.provider}
            options={(store.config?.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
            onChange={(v) => store.setProvider(v)}
            allowEmpty={false}
            ariaLabel="Provider"
            placeholder="Provider"
          />
          <input
            className="input chat-model-input"
            list="chat-models"
            value={store.model}
            onChange={(e) => store.setModel(e.target.value)}
            aria-label="Model"
            placeholder="model id"
          />
          <datalist id="chat-models">
            {(MODEL_SUGGESTIONS[store.provider] ?? []).map((m) => <option key={m} value={m} />)}
          </datalist>
          {providerCreds.length > 0 && (
            <Combobox
              value={store.credentialId}
              options={providerCreds.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => store.setCredentialId(v)}
              emptyLabel="Auto (latest)"
              ariaLabel="Credential"
              placeholder="Credential"
            />
          )}
          <button className="btn-icon btn-ghost" aria-label="System prompt" title="System prompt" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
          <button className="btn-icon btn-ghost" aria-label="Animation settings" title="Animation settings" onClick={() => setAnimOpen(true)}><Play size={18} /></button>
        </div>
      </header>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {!configured && (
          <div className="chat-empty">
            <Bot size={30} />
            <h3>Configure an AI provider</h3>
            <p className="small dim">Add an API key on the Credentials page, or enable the Cloudflare Workers AI binding.</p>
            <Link className="btn btn-primary" to="/credentials">Open Credentials</Link>
          </div>
        )}
        {configured && messages.length === 0 && (
          <div className="chat-empty">
            <Bot size={30} />
            <h3>Start a conversation</h3>
            <p className="small dim">Ask anything. Messages are stored in this conversation.</p>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            message={m}
            userName={user?.displayName || user?.email || 'You'}
            streaming={store.streamingId === m.id}
            canRegenerate={!store.sending && m.role === 'assistant'}
            onRegenerate={() => void useChat.getState().regenerate()}
            onCopy={() => { void navigator.clipboard?.writeText(m.content); toast('Copied'); }}
          />
        ))}
        {store.sending && !store.streamingId && (
          <div className="chat-msg assistant"><Avatar name="AI" ai /><div className="chat-bubble"><TypingDots /></div></div>
        )}
        {store.error && (
          <div className="chat-error" role="alert">
            <span>{store.error}</span>
            <button className="btn" onClick={() => { store.clearError(); void useChat.getState().regenerate(); }}><RefreshCw size={15} /> Retry</button>
            <button className="btn-icon btn-ghost" aria-label="Dismiss" onClick={store.clearError}><X size={16} /></button>
          </div>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          className="chat-input"
          rows={1}
          value={input}
          placeholder={store.activeId ? 'Message the assistant…' : 'Start a new chat…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Message"
        />
        {store.sending ? (
          <button className="btn btn-danger chat-send" onClick={() => useChat.getState().stop()} aria-label="Stop generating"><Square size={17} /> Stop</button>
        ) : (
          <button className="btn btn-primary chat-send" onClick={() => void submit()} disabled={!input.trim()} aria-label="Send message"><Send size={17} /> Send</button>
        )}
      </div>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="System prompt">
        <div className="field">
          <label htmlFor="chat-system">Instructions for the assistant</label>
          <textarea id="chat-system" className="textarea" rows={6} value={store.systemPrompt} onChange={(e) => store.setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant…" />
          <div className="hint">Sent with each request. Stored only in this browser session.</div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => setSettingsOpen(false)}>Done</button>
      </Sheet>

      <AnimationSettings open={animOpen} onClose={() => setAnimOpen(false)} />
    </>
  );
}

function ChatBubble({ message, userName, streaming, canRegenerate, onRegenerate, onCopy }: {
  message: ChatMsg; userName: string; streaming: boolean; canRegenerate: boolean;
  onRegenerate: () => void; onCopy: () => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={`chat-msg ${isUser ? 'user' : 'assistant'} chat-msg-in`}>
      {!isUser && <Avatar name="AI" ai />}
      <div className="chat-bubble-wrap">
        <div className="chat-bubble">
          {message.content
            ? <span className="chat-text">{message.content}</span>
            : streaming ? <TypingDots /> : null}
          {streaming && message.content && <span className="chat-caret" aria-hidden />}
        </div>
        <div className="chat-meta">
          <span>{fmtTime(message.createdAt)}</span>
          {message.content && <button className="chat-link" onClick={onCopy}><Copy size={12} /> Copy</button>}
          {!isUser && canRegenerate && <button className="chat-link" onClick={onRegenerate}><RefreshCw size={12} /> Regenerate</button>}
        </div>
      </div>
      {isUser && <Avatar name={userName} />}
    </div>
  );
}

function PublicChat() {
  const user = useApp((s) => s.user);
  const toast = useApp((s) => s.toast);
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const res = await publicApi.messages();
      setMessages(res.messages);
      setUsers(res.activeUsers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load public chat');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void publicApi.presence().then((r) => setUsers(r.activeUsers)).catch(() => undefined);
      void publicApi.messages().then((r) => { setMessages(r.messages); setUsers(r.activeUsers); }).catch(() => undefined);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, reduced]);

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await publicApi.send(text);
      setMessages((m) => [...m, res.message]);
      setUsers(res.activeUsers);
      setInput('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Message failed', 'error');
    } finally {
      setSending(false);
    }
  }

  const marqueeUsers = users.length > 0 ? users : [{ userId: user?.id || 'me', displayName: user?.displayName || 'You', lastSeen: '' }];

  return (
    <>
      <header className="chat-header">
        <div className="chat-title">
          <b>Public Chat</b>
          <span className="small dim"><Users size={12} /> {users.length} online · messages clear after 24h</span>
        </div>
        <div className="chat-header-controls">
          <span className="badge badge-info"><Globe size={12} /> Everyone signed in</span>
        </div>
      </header>

      <div className="presence-strip" aria-label={`${users.length} active users`}>
        <span className="presence-label"><i className="presence-live" /> {users.length} online</span>
        <div className="presence-marquee">
          <div className={`presence-track ${reduced ? 'reduced' : ''}`}>
            {[...marqueeUsers, ...marqueeUsers].map((u, i) => (
              <span className="presence-avatar" key={`${u.userId}-${i}`} title={u.displayName}>
                <UserAvatar userId={u.userId} name={u.displayName} size={30} />
                <i className="presence-dot" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {loading && <div className="small dim" style={{ padding: 12 }}>Loading public chat…</div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <Globe size={30} />
            <h3>No messages yet</h3>
            <p className="small dim">Say hello to everyone in the public room. Messages are deleted after 24 hours.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.userId === user?.id ? 'user' : 'assistant'} chat-msg-in`}>
            {m.userId !== user?.id && <UserAvatar userId={m.userId} name={m.displayName} size={30} />}
            <div className="chat-bubble-wrap">
              <div className="chat-author">{m.displayName}</div>
              <div className="chat-bubble"><span className="chat-text">{m.content}</span></div>
              <div className="chat-meta"><span>{fmtTime(m.createdAt)}</span></div>
            </div>
            {m.userId === user?.id && <UserAvatar userId={m.userId} name={m.displayName} size={30} />}
          </div>
        ))}
        {error && <div className="chat-error" role="alert">{error}</div>}
      </div>

      <div className="chat-composer">
        <textarea
          className="chat-input"
          rows={1}
          value={input}
          placeholder="Message the public room…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
          aria-label="Message"
        />
        <button className="btn btn-primary chat-send" onClick={() => void submit()} disabled={!input.trim() || sending} aria-label="Send message">
          {sending ? <span className="spinner" /> : <><Send size={17} /> Send</>}
        </button>
      </div>
    </>
  );
}

function AnimationSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useApp((s) => s.toast);
  const [presets, setPresets] = useState<Record<string, AnimationPreset>>(() => loadCustomPresets());
  const [selected, setSelected] = useState('messageIn');
  const [json, setJson] = useState(() => JSON.stringify(DEFAULT_PRESETS.messageIn, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const merged = { ...DEFAULT_PRESETS, ...presets };
    return Object.values(merged).map((p) => ({ value: p.id, label: p.name }));
  }, [presets]);

  function choose(id: string) {
    setSelected(id);
    const p = presets[id] || DEFAULT_PRESETS[id] || DEFAULT_PRESETS.messageIn;
    setJson(JSON.stringify(p, null, 2));
    setErrors([]);
  }

  function parse(): AnimationPreset | null {
    try {
      const p = JSON.parse(json);
      const errs = validatePreset(p);
      setErrors(errs);
      return errs.length === 0 ? p as AnimationPreset : null;
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Invalid JSON']);
      return null;
    }
  }

  function save() {
    const p = parse();
    if (!p) return;
    const next = { ...presets, [p.id]: p };
    setPresets(next);
    saveCustomPresets(next);
    toast('Animation preset saved', 'success');
  }

  function preview() {
    const p = parse();
    if (p) play(previewRef.current, p);
  }

  function reset() {
    const def = DEFAULT_PRESETS[selected] ?? presets[selected] ?? DEFAULT_PRESETS.messageIn;
    const next = { ...presets };
    delete next[selected];
    setPresets(next);
    saveCustomPresets(next);
    setJson(JSON.stringify(def, null, 2));
    setErrors([]);
    toast('Reset to default', 'success');
  }

  return (
    <Sheet open={open} onClose={onClose} title="Animation settings">
      <div className="field">
        <label htmlFor="anim-preset">Preset</label>
        <Combobox id="anim-preset" value={selected} options={options} onChange={choose} allowEmpty={false} ariaLabel="Animation preset" />
      </div>
      <div className="field">
        <label htmlFor="anim-json">Preset JSON (safe: transform/opacity/filter only)</label>
        <textarea id="anim-json" className="textarea mono" rows={10} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        <div className="hint">No scripts are executed. Invalid or unsafe values are rejected.</div>
      </div>
      {errors.length > 0 && (
        <div className="chat-error" role="alert" style={{ marginBottom: 10 }}>
          <div>{errors.map((e) => <div key={e}>{e}</div>)}</div>
        </div>
      )}
      <div className="row" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={preview}><Play size={15} /> Preview</button>
        <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset default</button>
        <button className="btn btn-primary" onClick={save}><Check size={15} /> Validate & save</button>
      </div>
      <div ref={previewRef} className="anim-preview">Preview</div>
      <div className="hint">Animations respect the system “reduce motion” setting.</div>
    </Sheet>
  );
}
