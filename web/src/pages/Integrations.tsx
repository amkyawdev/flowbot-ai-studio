import { useEffect, useState } from 'react';
import { Puzzle, Plus, Trash2, Plug, Database, Cpu } from 'lucide-react';
import { integrationsApi } from '@/api/client';
import { Empty, StatusBadge, Sheet, Loading } from '@/components/ui';
import { useApp } from '@/store/app';

const INTEGRATION_TYPES = [
  { type: 'mcp', name: 'Remote MCP Server', icon: Cpu, desc: 'Connect any MCP server via Streamable HTTP. Tools are discovered automatically.', config: { url: '', authType: 'none' }, secretLabel: 'Bearer token (optional)' },
  { type: 'zilliz', name: 'Zilliz (vector store)', icon: Database, desc: 'Arithmetic endpoint for semantic search & memory. Use instance env secrets or provide here.', config: { endpoint: '', collection: '' }, secretLabel: 'API token' },
];

export function IntegrationsPage() {
  const toast = useApp((s) => s.toast);
  const [items, setItems] = useState<any[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [testRun, setTestRun] = useState<Record<string, boolean>>({});

  async function load() {
    try { const res = await integrationsApi.list(); setItems(res.integrations); }
    catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); setItems([]); }
  }
  useEffect(() => { void load(); }, []);

  async function createIntegration(body: any) {
    await integrationsApi.create(body);
    toast('Integration created', 'success');
    setCreateOpen(false);
    void load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this integration?')) return;
    try { await integrationsApi.remove(id); toast('Integration deleted', 'success'); void load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error'); }
  }

  async function test(id: string) {
    setTestRun((t) => ({ ...t, [id]: true }));
    try {
      const res = await integrationsApi.test(id);
      toast(res.message, res.ok ? 'success' : 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Test failed', 'error'); }
    finally { setTestRun((t) => ({ ...t, [id]: false })); }
  }

  if (items === null) return <Loading />;

  return (
    <div>
      <div className="topbar">
        <h1>Integrations</h1>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add</button>
      </div>
      {items.length === 0 ? (
        <Empty icon={<Puzzle size={26} />} title="No integrations yet" sub="Connect MCP servers and vector stores. Connections are always tested server-side." action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add integration</button>} />
      ) : (
        <div className="glass">
          {items.map((it: any) => (
            <div key={it.id} className="row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="row-avatar"><Plug size={18} /></div>
              <div className="row-body">
                <div className="row-title">{it.name}</div>
                <div className="row-sub">{it.type} · {it.config?.url || it.config?.endpoint || '—'}</div>
              </div>
              <StatusBadge status={it.status || 'pending'} />
              <button className="btn" style={{ minHeight: 38, fontSize: 13 }} disabled={testRun[it.id]} onClick={() => void test(it.id)}>
                {testRun[it.id] ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Test'}
              </button>
              <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={() => void remove(it.id)} aria-label="Delete"><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      )}
      <CreateIntegrationSheet open={createOpen} onClose={() => setCreateOpen(false)} onSave={createIntegration} />
    </div>
  );
}

function CreateIntegrationSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (b: any) => Promise<void> }) {
  const toast = useApp((s) => s.toast);
  const [selected, setSelected] = useState(INTEGRATION_TYPES[0]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [collection, setCollection] = useState('');
  const [authType, setAuthType] = useState('none');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const cfg = selected.type === 'mcp' ? { url: url.trim(), authType } : { endpoint: url.trim(), collection: collection.trim() };
    setName((n) => n || (selected.type === 'mcp' ? 'My MCP Server' : 'Zilliz'));
    try {
      await onSave({ name: name || (selected.type === 'mcp' ? 'My MCP Server' : 'Zilliz'), type: selected.type, config: cfg, secret: secret.trim() || undefined });
      setUrl(''); setCollection(''); setSecret(''); setName('');
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add integration">
      <div className="field">
        <label>Type</label>
        <select className="select" value={selected.type} onChange={(e) => setSelected(INTEGRATION_TYPES.find((t) => t.type === e.target.value)!) }>
          {INTEGRATION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}
        </select>
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>{selected.desc}</p>
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={selected.name} /></div>
      <div className="field"><label>{selected.type === 'mcp' ? 'MCP server URL' : 'Zilliz endpoint'}</label><input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={selected.type === 'mcp' ? 'https://mcp.example.com/mcp' : 'https://…zilliz.com'} /></div>
      {selected.type === 'zilliz' && (
        <div className="field"><label>Collection name</label><input className="input" value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="flowbot_chunks" /></div>
      )}
      {selected.type === 'mcp' && (
        <div className="field">
          <label>Auth</label>
          <select className="select" value={authType} onChange={(e) => setAuthType(e.target.value)}>
            <option value="none">None</option>
            <option value="bearer">Bearer token</option>
          </select>
        </div>
      )}
      <div className="field"><label>{selected.secretLabel}</label><input className="input mono" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="stored encrypted, never exposed" /></div>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void save()}>{busy ? <span className="spinner" /> : <Plug size={17} />} Save integration</button>
    </Sheet>
  );
}