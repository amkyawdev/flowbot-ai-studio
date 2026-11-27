import { useEffect, useState } from 'react';
import { Bot, Plus, Trash2, Link2, Send, Power, MessageSquare } from 'lucide-react';
import { botsApi } from '@/api/client';
import { Empty, StatusBadge, Sheet, Loading } from '@/components/ui';
import { useApp } from '@/store/app';
import { timeAgo } from '@flowbot/shared';

const providerOptions = [
  { value: 'openai', label: 'OpenAI-compatible' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
];

export function BotsPage() {
  const toast = useApp((s) => s.toast);
  const [bots, setBots] = useState<any[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manage, setManage] = useState<any | null>(null);

  async function load() {
    try { const res = await botsApi.list(); setBots(res.bots); }
    catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); setBots([]); }
  }
  useEffect(() => { void load(); }, []);

  async function createBot(body: { name: string; token: string }) {
    await botsApi.create(body);
    toast('Bot added & verified with Telegram', 'success');
    setCreateOpen(false);
    void load();
  }

  async function removeBot(id: string) {
    if (!confirm('Delete this bot?')) return;
    try { await botsApi.remove(id); toast('Bot deleted', 'success'); void load(); if (manage?.id === id) setManage(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error'); }
  }

  async function setWebhook(id: string) {
    try { const r = await botsApi.webhook(id); toast(`Webhook active: ${r.webhookUrl}`, 'success'); void load(); setManage((m: any) => m && ({ ...m, webhookStatus: 'active' })); }
    catch (e) { toast(e instanceof Error ? e.message : 'Webhook failed', 'error'); }
  }

  if (bots === null) return <Loading />;

  return (
    <div>
      <div className="topbar">
        <h1>Telegram Bots</h1>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add bot</button>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Bots are created inside Telegram with <b>@BotFather</b> — paste the token here to manage webhooks and messages. Tokens are encrypted and never leave the server.
      </p>

      {bots.length === 0 ? (
        <Empty icon={<Bot size={26} />} title="No bots connected" sub="Create a bot with @BotFather, then add its token here." action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add bot</button>} />
      ) : (
        <div className="glass">
          {bots.map((b: any) => (
            <div key={b.id} className="row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setManage(b)}>
              <div className="row-avatar"><Bot size={20} /></div>
              <div className="row-body">
                <div className="row-title">@{b.username || b.name}</div>
                <div className="row-sub">{b.name} · {timeAgo(b.createdAt || b.created_at)}</div>
              </div>
              <StatusBadge status={b.webhookStatus || 'inactive'} />
              <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); void removeBot(b.id); }} aria-label="Delete"><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      )}

      <CreateBotSheet open={createOpen} onClose={() => setCreateOpen(false)} onSave={createBot} />
      {manage && <ManageBotSheet bot={manage} onClose={() => setManage(null)} onRefresh={() => void load()} onWebhook={() => setWebhook(manage.id)} onDelete={() => void removeBot(manage.id)} />}
    </div>
  );
}

function CreateBotSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (b: { name: string; token: string }) => Promise<void> }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!token.trim()) return toast('Paste the bot token from @BotFather', 'error');
    setBusy(true);
    try { await onSave({ name: name.trim() || 'Telegram Bot', token: token.trim() }); setName(''); setToken(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Connect Telegram bot">
      <div className="card small dim" style={{ marginBottom: 14 }}>
        1. Open <b>Telegram</b> → search <b>@BotFather</b> → <b>/newbot</b>.<br />
        2. Copy the token it sends (looks like <span className="mono">123456:ABC…</span>).<br />
        3. Paste it below. Your bot username must already exist.
      </div>
      <div className="field"><label>Bot name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Assistant" /></div>
      <div className="field"><label>Bot token (from @BotFather)</label><input className="input mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" /></div>
      <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : <Bot size={18} />} Verify & connect</button>
    </Sheet>
  );
}

function ManageBotSheet({ bot, onClose, onRefresh, onWebhook, onDelete }: { bot: any; onClose: () => void; onRefresh: () => void; onWebhook: () => void; onDelete: () => void }) {
  const toast = useApp((s) => s.toast);
  const [commands, setCommands] = useState<string>(bot.commands?.length ? bot.commands.map((c: any) => `/${c.command} — ${c.description}`).join('\n') : '');
  const [chatId, setChatId] = useState('');
  const [testText, setTestText] = useState('Hello from FlowBot AI Studio ✨');
  const [promptConfig, setPromptConfig] = useState(bot.promptConfig ?? {});

  async function saveSettings() {
    try {
      await botsApi.save(bot.id, {
        commands: commands.split('\n').filter(Boolean).map((line) => {
          const m = line.trim().match(/^\/([\w]+)\s*[-—:]\s*(.*)$/) || line.trim().match(/^([\w]+)\s*[-—:]\s*(.*)$/);
          return m ? { command: m[1], description: m[2] } : null;
        }).filter(Boolean),
        promptConfig,
      });
      toast('Bot settings saved', 'success');
      onRefresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Save failed', 'error'); }
  }

  async function sendTest() {
    try { await botsApi.test(bot.id, { chatId, text: testText }); toast('Test message sent', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Send failed', 'error'); }
  }

  return (
    <Sheet open onClose={onClose} title={`@${bot.username || bot.name}`}>
      <div className="flex gap-8" style={{ marginBottom: 16 }}>
        <StatusBadge status={bot.webhookStatus || 'inactive'} />
        <button className="btn" style={{ minHeight: 38, fontSize: 13 }} onClick={() => void onWebhook()}><Link2 size={15} /> Set webhook</button>
        <button className="btn" style={{ minHeight: 38, fontSize: 13 }} onClick={() => void onDelete()}><Trash2 size={15} /> Delete</button>
      </div>

      <div className="section-title">Commands</div>
      <div className="field">
        <label>Custom commands (one per line: /command — description)</label>
        <textarea className="textarea mono" rows={5} value={commands} onChange={(e) => setCommands(e.target.value)} placeholder={'/start — Start the bot\n/help — Show help\n/quote — Get a quote'} />
      </div>

      <div className="section-title">AI reply (when no workflow handles the message)</div>
      <div className="field">
        <label>AI provider</label>
        <select className="select" value={String(promptConfig.provider || 'openai')} onChange={(e) => setPromptConfig({ ...promptConfig, provider: e.target.value })}>
          {providerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="field"><label>System prompt</label><textarea className="textarea" rows={3} value={String(promptConfig.systemPrompt || '')} onChange={(e) => setPromptConfig({ ...promptConfig, systemPrompt: e.target.value })} placeholder="You are a helpful assistant…" /></div>
      <button className="btn btn-primary btn-block" onClick={saveSettings}><Power size={17} /> Save settings</button>

      <div className="section-title">Test flow</div>
      <div className="field"><label>Your chat ID</label><input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Send a message to @userinfobot to find it" /></div>
      <div className="field"><label>Message</label><input className="input" value={testText} onChange={(e) => setTestText(e.target.value)} /></div>
      <button className="btn btn-block" onClick={() => void sendTest()}><Send size={16} /> Send test message</button>

      <div className="section-title">Message log</div>
      <button className="btn btn-ghost btn-block small" onClick={() => { botsApi.messages(bot.id).then((r) => toast(`${r.messages.length} messages logged`, 'info')); }}>
        <MessageSquare size={15} /> View message history
      </button>
    </Sheet>
  );
}