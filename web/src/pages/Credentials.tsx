import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { credentialsApi } from '@/api/client';
import { Empty, Sheet, Loading } from '@/components/ui';
import { Combobox } from '@/components/Combobox';
import { useApp } from '@/store/app';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', fields: ['apiKey', 'baseUrl', 'headers'] },
  { value: 'groq', label: 'Groq', fields: ['apiKey', 'headers'] },
  { value: 'openrouter', label: 'OpenRouter', fields: ['apiKey', 'baseUrl', 'headers'] },
  { value: 'gemini', label: 'Google Gemini', fields: ['apiKey', 'headers'] },
  { value: 'anthropic', label: 'Anthropic', fields: ['apiKey', 'baseUrl', 'headers'] },
  { value: 'openai-compatible', label: 'Custom OpenAI-compatible', fields: ['apiKey', 'baseUrl', 'model', 'headers'] },
  { value: 'telegram', label: 'Telegram (bot token)', fields: ['token'] },
];

export function CredentialsPage() {
  const toast = useApp((s) => s.toast);
  const [items, setItems] = useState<any[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    try { const res = await credentialsApi.list(); setItems(res.credentials); }
    catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); setItems([]); }
  }
  useEffect(() => { void load(); }, []);

  async function createCred(body: any) {
    await credentialsApi.create(body);
    toast('Credential stored encrypted', 'success');
    setCreateOpen(false);
    void load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this credential? It will break workflows that use it.')) return;
    try { await credentialsApi.remove(id); toast('Credential deleted', 'success'); void load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error'); }
  }

  async function test(id: string) {
    try { const r = await credentialsApi.test(id); toast(r.message, r.ok ? 'success' : 'error'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Test failed', 'error'); }
  }

  if (items === null) return <Loading />;

  return (
    <div>
      <div className="topbar">
        <h1>Credentials</h1>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add</button>
      </div>
      <div className="flex gap-8" style={{ marginBottom: 16 }}>
        <span className="badge badge-success"><ShieldCheck size={13} /> AES-256-GCM encrypted at rest</span>
        <span className="badge">Never returned to the browser</span>
      </div>

      {items.length === 0 ? (
        <Empty icon={<KeyRound size={26} />} title="No credentials yet" sub="API keys and tokens are encrypted server-side with Web Crypto and never exposed to your browser." action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add credential</button>} />
      ) : (
        <div className="glass">
          {items.map((c: any) => (
            <div key={c.id} className="row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="row-avatar"><KeyRound size={17} /></div>
              <div className="row-body">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">{c.provider} · {Object.keys(c.meta?.maskedKeys ?? {}).length} secret fields</div>
              </div>
              <button className="btn" style={{ minHeight: 38, fontSize: 13 }} onClick={() => void test(c.id)}>Test</button>
              <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={() => void remove(c.id)} aria-label="Delete"><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      )}
      <CreateCredentialSheet open={createOpen} onClose={() => setCreateOpen(false)} onSave={createCred} />
    </div>
  );
}

function CreateCredentialSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (b: any) => Promise<void> }) {
  const toast = useApp((s) => s.toast);
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({ apiKey: '' });
  const [show, setShow] = useState(false);

  function setField(k: string, v: string) { setValues((d) => ({ ...d, [k]: v })); }

  function changeProvider(p: typeof PROVIDERS[0]) {
    setProvider(p);
    const next: Record<string, string> = {};
    p.fields.forEach((f) => { next[f] = ''; });
    setValues(next);
    setName((n) => n || p.label);
  }

  async function save() {
    const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
    if (Object.keys(data).length === 0) return toast('Enter at least one value', 'error');
    setBusy(true);
    try { await onSave({ name: name.trim() || provider.label, provider: provider.value, data }); setName(''); setShow(false); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  }
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title="Add credential">
      <div className="field">
        <label htmlFor="cred-provider">Provider</label>
        <Combobox
          id="cred-provider"
          value={provider.value}
          options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
          onChange={(v) => changeProvider(PROVIDERS.find((p) => p.value === v)!)}
          allowEmpty={false}
          ariaLabel="Provider"
        />
      </div>
      <div className="field"><label htmlFor="cred-name">Name</label><input id="cred-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={provider.label} /></div>
      {provider.fields.map((f) => (
        <div className="field" key={f}>
          <label htmlFor={`cred-${f}`}>{f}</label>
          {f === 'headers' ? (
            <textarea
              id={`cred-${f}`}
              className="textarea mono"
              rows={3}
              value={values[f] ?? ''}
              onChange={(e) => setField(f, e.target.value)}
              placeholder='{"X-Custom-Header":"value"}'
            />
          ) : (
            <div className="flex gap-8">
              <input
                id={`cred-${f}`}
                className="input mono"
                style={{ flex: 1 }}
                type={show ? 'text' : 'password'}
                value={values[f] ?? ''}
                onChange={(e) => setField(f, e.target.value)}
              />
              <button className="btn-icon btn-ghost" type="button" onClick={() => setShow((v) => !v)} aria-label="Toggle visibility">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          )}
          {f === 'baseUrl' && <div className="hint">Leave blank for the default endpoint.</div>}
          {f === 'headers' && <div className="hint">Optional JSON headers, stored encrypted and sent server-side only.</div>}
          {f === 'model' && <div className="hint">Default model id for this credential (optional).</div>}
        </div>
      ))}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void save()}>{busy ? <span className="spinner" /> : <ShieldCheck size={17} />} Encrypt & save</button>
    </Sheet>
  );
}