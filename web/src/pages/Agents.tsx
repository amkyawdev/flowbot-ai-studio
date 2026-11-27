import { useEffect, useState } from 'react';
import { BotMessageSquare, Plus, Trash2, Wand2 } from 'lucide-react';
import { agentsApi, credentialsApi } from '@/api/client';
import { Empty, Sheet, Loading } from '@/components/ui';
import { useApp } from '@/store/app';
import { modelsFor } from '@/lib/models';

const providers = [
  { value: 'openai', label: 'OpenAI-compatible', models: modelsFor('openai') },
  { value: 'groq', label: 'Groq', models: modelsFor('groq') },
  { value: 'openrouter', label: 'OpenRouter (free models)', models: modelsFor('openrouter') },
  { value: 'deepseek', label: 'DeepSeek', models: modelsFor('deepseek') },
  { value: 'minimax', label: 'MiniMax', models: modelsFor('minimax') },
  { value: 'experiential-labs', label: 'Experiential Labs', models: modelsFor('experiential-labs') },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', models: modelsFor('cloudflare') },
  { value: 'gemini', label: 'Google Gemini', models: modelsFor('gemini') },
  { value: 'anthropic', label: 'Anthropic', models: modelsFor('anthropic') },
];

export function AgentsPage() {
  const toast = useApp((s) => s.toast);
  const [agents, setAgents] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any>(null);

  async function load() {
    try { const res = await agentsApi.list(); setAgents(res.agents); }
    catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); setAgents([]); }
  }
  useEffect(() => { void load(); }, []);

  if (agents === null) return <Loading />;

  const currentId = editing?.id || 'new';

  return (
    <div>
      <div className="topbar">
        <h1>AI Agents</h1>
        <button className="btn btn-primary" onClick={() => setEditing({ id: 'new', name: '', systemPrompt: '', provider: 'openai', model: '', temperature: 0.7, memoryConfig: {}, tools: [], structuredOutput: null })}>
          <Plus size={18} /> New agent
        </button>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>Reusable prompt + model + tool configs. Reference an agent from the <b>AI Agent</b> node in any workflow, or assign it to a bot.</p>

      {agents.length === 0 ? (
        <Empty icon={<BotMessageSquare size={26} />} title="No agents yet" sub="Create a reusable agent with its own system prompt and model." action={<button className="btn btn-primary" onClick={() => setEditing({ id: 'new', name: '', systemPrompt: '', provider: 'openai', model: '', temperature: 0.7, memoryConfig: {}, tools: [], structuredOutput: null })}><Plus size={18} /> New agent</button>} />
      ) : (
        <div className="glass">
          {agents.map((a: any) => (
            <div key={a.id} className="row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setEditing({ ...a, id: a.id })}>
              <div className="row-avatar"><BotMessageSquare size={18} /></div>
              <div className="row-body">
                <div className="row-title">{a.name}</div>
                <div className="row-sub">{(a.model || a.provider)} · {(a.systemPrompt || 'No system prompt').slice(0, 60)}</div>
              </div>
              <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); void deleteAgent(a.id); }} aria-label="Delete"><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AgentSheet
          key={currentId}
          agent={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );

  async function deleteAgent(id: string) {
    if (!confirm('Delete this agent?')) return;
    try { await agentsApi.remove(id); toast('Agent deleted', 'success'); void load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error'); }
  }
}

function AgentSheet({ agent, onClose, onDone }: { agent: any; onClose: () => void; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(agent.name);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt || '');
  const [provider, setProvider] = useState(agent.provider || 'openai');
  const [model, setModel] = useState(agent.model || providers[0].models[0]);
  const [baseUrl, setBaseUrl] = useState(agent.baseUrl || '');
  const [credentialId, setCredentialId] = useState(agent.credentialId || '');
  const [credentials, setCredentials] = useState<any[]>([]);
  const [temperature, setTemperature] = useState(Number(agent.temperature ?? 0.7));
  const [tools, setTools] = useState<string>((agent.tools || []).map((t: any) => t.name || t).join(', '));
  const [structured, setStructured] = useState<string>(agent.structuredOutput ? JSON.stringify(agent.structuredOutput) : '');
  const [structuredEnabled, setStructuredEnabled] = useState(Boolean(agent.structuredOutput));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    credentialsApi.list().then((r) => setCredentials(r.credentials)).catch(() => undefined);
  }, []);

  const providerModelOptions = providers.find((p) => p.value === provider)?.models ?? [];

  async function save() {
    if (!name.trim()) return toast('Give the agent a name', 'error');
    setBusy(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      systemPrompt,
      provider,
      model,
      baseUrl: baseUrl.trim(),
      credentialId: credentialId || null,
      temperature,
      tools: tools.split(',').map((t) => t.trim()).filter(Boolean).map((name) => ({ name, type: 'builtin' })),
      structuredOutput: structuredEnabled ? parseJsonLoose(structured) : null,
    };
    try {
      if (agent.id === 'new') await agentsApi.create(body);
      else await agentsApi.save(agent.id, body);
      toast('Agent saved', 'success');
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : 'Save failed', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title={agent.id === 'new' ? 'New AI agent' : 'Edit agent'}>
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support assistant" /></div>
      <div className="field"><label>System prompt</label><textarea className="textarea" rows={5} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful support agent…" /></div>
      <div className="field">
        <label>Provider</label>
        <select className="select" value={provider} onChange={(e) => { const p = e.target.value; setProvider(p); setModel(providers.find((x) => x.value === p)?.models[0] ?? ''); }}>
          {providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Model</label>
        <input className="input" list="agent-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" />
        <datalist id="agent-models">{providerModelOptions.map((m) => <option key={m} value={m} />)}</datalist>
      </div>
      <div className="field">
        <label>Custom endpoint (base URL)</label>
        <input className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1 (blank = provider default)" />
        <div className="hint">Point at any OpenAI-compatible endpoint (self-hosted, local gateway, another AI service).</div>
      </div>
      <div className="field">
        <label>API credential</label>
        <div className="flex gap-8">
          <select className="select" style={{ flex: 1 }} value={credentialId} onChange={(e) => setCredentialId(e.target.value)}>
            <option value="">Auto (latest {provider} credential)</option>
            {credentials.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>)}
          </select>
          {credentialId && (
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try { const r = await credentialsApi.test(credentialId); toast(r.message, r.ok ? 'success' : 'error'); }
                catch (e) { toast(e instanceof Error ? e.message : 'Test failed', 'error'); }
              }}
            >
              Test
            </button>
          )}
        </div>
        <div className="hint">Add API keys on the <b>Credentials</b> page. Works without one if a provider credential already exists.</div>
      </div>
      <div className="field"><label>Temperature ({temperature.toFixed(1)})</label><input className="input" type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} /></div>
      <div className="field"><label>Tools (comma-separated, e.g. mcp)</label><input className="input" value={tools} onChange={(e) => setTools(e.target.value)} placeholder="mcp, calculator" /></div>
      <label className="flex" style={{ minHeight: 44, marginBottom: 8 }}>
        <input type="checkbox" checked={structuredEnabled} onChange={(e) => setStructuredEnabled(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span className="small">Structured output (JSON schema)</span>
      </label>
      {structuredEnabled && (
        <div className="field"><label>JSON schema</label><textarea className="textarea mono" rows={4} value={structured} onChange={(e) => setStructured(e.target.value)} placeholder='{"type":"object","properties":{…}}' /></div>
      )}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => void save()}>{busy ? <span className="spinner" /> : <Wand2 size={17} />} Save agent</button>
      <div className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
        Works with defaults, or point at your own endpoint + API key above.
      </div>
    </Sheet>
  );
}

function parseJsonLoose(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}