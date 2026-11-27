import { useEffect, useMemo, useState } from 'react';
import { getNodeDefinition } from '@flowbot/shared';
import type { ConfigField } from '@flowbot/shared';
import type { Node } from '@xyflow/react';
import { Sheet } from '@/components/ui';
import { Combobox, type ComboOption } from '@/components/Combobox';
import { useWorkflow } from '@/store/workflow';
import { useApp } from '@/store/app';
import { credentialsApi, botsApi, agentsApi } from '@/api/client';

const AI_PROVIDERS = ['openai', 'groq', 'openrouter', 'anthropic', 'gemini', 'openai-compatible', 'cloudflare'];
const AI_NODES = ['openaiChat', 'gemini', 'cloudflareAI', 'aiAgent'];

export function NodeConfigSheet({ node }: { node: Node | null }) {
  const updateNodeData = useWorkflow((s) => s.updateNodeData);
  const selectNode = useWorkflow((s) => s.selectNode);
  const toast = useApp((s) => s.toast);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [credentialList, setCredentialList] = useState<any[]>([]);
  const [botList, setBotList] = useState<any[]>([]);
  const [agentList, setAgentList] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const nodeId = node?.id;
  const nodeType = node?.type ?? '';

  useEffect(() => {
    if (!node) return;
    setDraft({ ...node.data });
    setErrors({});
    setLoadingLists(true);
    Promise.all([
      credentialsApi.list().catch(() => ({ credentials: [] as any[] })),
      botsApi.list().catch(() => ({ bots: [] as any[] })),
      agentsApi.list().catch(() => ({ agents: [] as any[] })),
    ]).then(([c, b, a]) => {
      setCredentialList(c.credentials);
      setBotList(b.bots);
      setAgentList(a.agents);
    }).finally(() => setLoadingLists(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const optionsFor = useMemo(() => (field: ConfigField): ComboOption[] | undefined => {
    if (field.options) return field.options;
    if (field.type === 'bot') return botList.map((b) => ({ value: b.id, label: `@${b.username || b.name}` }));
    if (field.type === 'agent') return agentList.map((a) => ({ value: a.id, label: a.name }));
    if (field.type === 'credential') {
      const pool = AI_NODES.includes(nodeType)
        ? credentialList.filter((c) => AI_PROVIDERS.includes(c.provider))
        : credentialList;
      return pool.map((c) => ({ value: c.id, label: `${c.name} (${c.provider})` }));
    }
    return undefined;
  }, [botList, agentList, credentialList, nodeType]);

  const def = node ? getNodeDefinition(nodeType) : undefined;

  if (!node || !def) return null;
  const activeNode = node;
  const definition = def;

  const set = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => { if (!e[key]) return e; const next = { ...e }; delete next[key]; return next; });
  };

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const field of definition.config) {
      const value = draft[field.key] ?? field.default ?? '';
      if (field.required && (value === '' || value === null || value === undefined)) {
        next[field.key] = `${field.label} is required`;
        continue;
      }
      if (field.type === 'json' && typeof value === 'string' && value.trim() !== '') {
        try { JSON.parse(value); } catch { next[field.key] = 'Invalid JSON'; }
      }
      if (field.type === 'number' && value !== '' && !Number.isFinite(Number(value))) {
        next[field.key] = 'Enter a valid number';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast(Object.values(next)[0], 'error');
      return false;
    }
    return true;
  }

  function close() {
    const changed = JSON.stringify(draft) !== JSON.stringify(activeNode.data);
    if (changed && !confirm('Discard unsaved changes to this node?')) return;
    selectNode(null);
  }

  function save() {
    if (!validate()) return;
    updateNodeData(activeNode.id, draft);
    toast('Node updated', 'success');
    selectNode(null);
  }

  return (
    <Sheet open={!!node} onClose={close} title={definition.name}>
      <div className="flex gap-8 mb-8">
        <span className="badge badge-info">{definition.category}</span>
        <span className="small dim">{definition.description}</span>
      </div>
      {loadingLists && <div className="hint" style={{ marginBottom: 8 }}>Loading options…</div>}
      {definition.config.map((field) => {
        const options = optionsFor(field);
        const value = draft[field.key] ?? field.default ?? '';
        const id = `cfg-${activeNode.id}-${field.key}`;
        const error = errors[field.key];
        const useCombo = field.type === 'credential' || field.type === 'bot' || field.type === 'agent'
          || (field.type === 'select' && (options?.length ?? 0) > 6);
        return (
          <div className="field" key={field.key}>
            <label htmlFor={id}>
              {field.label}
              {field.required && <span style={{ color: 'var(--red)' }}> *</span>}
            </label>
            {useCombo && options ? (
              <Combobox
                id={id}
                value={String(value)}
                options={options}
                onChange={(v) => set(field.key, v)}
                emptyLabel={field.type === 'bot' ? 'Select a bot…' : field.type === 'agent' ? 'Select an agent…' : 'Select…'}
                ariaLabel={field.label}
              />
            ) : field.type === 'select' || options ? (
              <select id={id} className="select" value={String(value)} onChange={(e) => set(field.key, e.target.value)}>
                {(!value) && <option value="">Select…</option>}
                {(options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea id={id} className="textarea" rows={field.rows ?? 3} value={String(value)} placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)} />
            ) : field.type === 'number' ? (
              <input id={id} className="input" type="number" value={String(value)} placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value === '' ? '' : Number(e.target.value))} />
            ) : field.type === 'json' ? (
              <textarea id={id} className="textarea mono" rows={3} value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
                placeholder={field.placeholder} onChange={(e) => set(field.key, e.target.value)} />
            ) : field.type === 'boolean' ? (
              <label className="flex" style={{ minHeight: 44 }}>
                <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.key, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span className="small">{field.help || 'Enabled'}</span>
              </label>
            ) : (
              <input id={id} className="input" value={String(value)} placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)} />
            )}
            {error && <div className="hint" style={{ color: 'var(--red)' }}>{error}</div>}
            {!error && field.help && field.type !== 'boolean' && <div className="hint">{field.help}</div>}
            {options && options.length === 0 && !loadingLists && (
              <div className="hint">
                No options yet.{' '}
                {field.type === 'bot' ? 'Add a bot on the Bots page.' : field.type === 'agent' ? 'Create an agent on the AI Agents page.' : 'Add one on the Credentials page.'}
              </div>
            )}
          </div>
        );
      })}
      <button className="btn btn-primary btn-block" onClick={save}>Save node</button>
      <div className="row" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn btn-block" onClick={() => { useWorkflow.getState().duplicateNode(activeNode.id); toast('Node duplicated'); }}>Duplicate</button>
        <button className="btn btn-danger btn-block" onClick={() => { useWorkflow.getState().removeNode(activeNode.id); toast('Node removed'); }}>Remove node</button>
      </div>
    </Sheet>
  );
}
