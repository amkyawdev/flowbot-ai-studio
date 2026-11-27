import { useEffect, useState } from 'react';
import { getNodeDefinition } from '@flowbot/shared';
import type { Node } from '@xyflow/react';
import { Sheet } from '@/components/ui';
import { useWorkflow } from '@/store/workflow';
import { useApp } from '@/store/app';
import { credentialsApi, botsApi, agentsApi } from '@/api/client';

export function NodeConfigSheet({ node }: { node: Node | null }) {
  const updateNodeData = useWorkflow((s) => s.updateNodeData);
  const selectNode = useWorkflow((s) => s.selectNode);
  const toast = useApp((s) => s.toast);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [credentialList, setCredentialList] = useState<any[]>([]);
  const [botList, setBotList] = useState<any[]>([]);
  const [agentList, setAgentList] = useState<any[]>([]);

  useEffect(() => {
    if (node) {
      setDraft({ ...node.data });
      Promise.all([
        credentialsApi.list().catch(() => ({ credentials: [] as any[] })),
        botsApi.list().catch(() => ({ bots: [] as any[] })),
        agentsApi.list().catch(() => ({ agents: [] as any[] })),
      ]).then(([c, b, a]) => {
        setCredentialList(c.credentials);
        setBotList(b.bots);
        setAgentList(a.agents);
      });
    }
  }, [node?.id]);

  if (!node) return null;
  const nodeType = node.type ?? '';
  const def = getNodeDefinition(nodeType);
  if (!def) return null;
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  function optionsFor(field: any): { value: string; label: string }[] | undefined {
    if (field.options) return field.options;
    if (field.type === 'credential') {
      const aiCreds = credentialList.filter((c) => ['openai', 'groq', 'openrouter', 'anthropic', 'gemini'].includes(c.provider));
      return (nodeType === 'openaiChat' || nodeType === 'gemini' ? aiCreds : credentialList).map((c) => ({ value: c.id, label: c.name }));
    }
    if (field.key === 'bot') return botList.map((b) => ({ value: b.id, label: `@${b.username || b.name}` }));
    if (field.key === 'agent') return agentList.map((a) => ({ value: a.id, label: a.name }));
    return undefined;
  }

  return (
    <Sheet open={!!node} onClose={() => selectNode(null)} title={def.name}>
      <div className="flex gap-8 mb-8">
        <span className="badge badge-info">{def.category}</span>
        <span className="small dim">{def.description}</span>
      </div>
      {def.config.map((field) => {
        const options = optionsFor(field);
        const value = draft[field.key] ?? field.default ?? '';
        const id = `cfg-${node.id}-${field.key}`;
        return (
          <div className="field" key={field.key}>
            <label htmlFor={id}>{field.label}</label>
            {field.type === 'select' || options ? (
              <select id={id} className="select" value={String(value)} onChange={(e) => set(field.key, e.target.value)}>
                {(!value) && <option value="">Select…</option>}
                {options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea id={id} className="textarea" rows={field.rows ?? 3} value={String(value)} placeholder={field.placeholder}
                onChange={(e) => set(field.key, e.target.value)} />
            ) : field.type === 'number' ? (
              <input id={id} className="input" type="number" value={Number(value)} placeholder={field.placeholder}
                onChange={(e) => set(field.key, Number(e.target.value))} />
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
            {field.help && field.type !== 'boolean' && <div className="hint">{field.help}</div>}
          </div>
        );
      })}
      <button
        className="btn btn-primary btn-block"
        onClick={() => {
          updateNodeData(node.id, draft);
          toast('Node updated', 'success');
          selectNode(null);
        }}
      >
        Save node
      </button>
      <div className="row" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn btn-block" onClick={() => { useWorkflow.getState().duplicateNode(node.id); toast('Node duplicated'); }}>
          Duplicate
        </button>
        <button className="btn btn-danger btn-block" onClick={() => { useWorkflow.getState().removeNode(node.id); toast('Node removed'); }}>
          Remove node
        </button>
      </div>
    </Sheet>
  );
}

