import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Wand2, Bot } from 'lucide-react';
import { Sheet } from '@/components/ui';
import { Combobox } from '@/components/Combobox';
import { useApp } from '@/store/app';
import { chatApi, workflowsApi } from '@/api/client';
import type { ChatConfig } from '@/api/client';
import { NODE_REGISTRY, validateGraph } from '@flowbot/shared';

function parseWorkflowJson(text: string): { name?: string; graph: any } {
  const cleaned = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI did not return JSON. Try a more specific prompt.');
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  const graph = obj.graph ?? obj;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('AI JSON is missing nodes/edges.');
  }
  return { name: typeof obj.name === 'string' ? obj.name : undefined, graph };
}

function normalizeGraph(graph: any) {
  const nodes = graph.nodes.map((n: any, i: number) => ({
    id: String(n.id || `n_${i + 1}`),
    type: String(n.type || 'set'),
    position: n.position && typeof n.position.x === 'number' ? n.position : { x: i * 220, y: 0 },
    data: n.data && typeof n.data === 'object' ? n.data : {},
  }));
  const edges = graph.edges.map((e: any, i: number) => ({
    id: String(e.id || `e_${i + 1}`),
    source: String(e.source),
    sourceHandle: e.sourceHandle ?? '',
    target: String(e.target),
    targetHandle: e.targetHandle ?? '',
  }));
  return { nodes, edges };
}

export function AiWorkflowBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [credentialId, setCredentialId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRaw('');
    chatApi.config().then((c) => {
      setConfig(c);
      const firstCred = c.credentials.find((cr) => c.providers.some((p) => p.id === cr.provider));
      const p = c.cloudflareAvailable ? 'cloudflare' : (firstCred?.provider || 'openai');
      const meta = c.providers.find((x) => x.id === p);
      const defaultModel = p === 'cloudflare' ? '@cf/meta/llama-3.3-70b-instruct' : (meta?.defaultModel || 'gpt-4o-mini');
      setProvider(p);
      setModel(defaultModel);
      setCredentialId(p === 'cloudflare' ? '' : (firstCred?.id || ''));
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load AI configuration'));
  }, [open]);

  const providerMeta = config?.providers.find((p) => p.id === provider);
  const providerCreds = useMemo(
    () => config?.credentials.filter((c) => c.provider === provider) ?? [],
    [config, provider],
  );

  function changeProvider(next: string) {
    const meta = config?.providers.find((p) => p.id === next);
    const cred = config?.credentials.find((c) => c.provider === next);
    setProvider(next);
    setModel(next === 'cloudflare' ? '@cf/meta/llama-3.3-70b-instruct' : (meta?.defaultModel || model));
    setCredentialId(next === 'cloudflare' ? '' : (cred?.id || ''));
  }

  async function generate() {
    const text = prompt.trim();
    if (!text) return;
    if (!config?.configured) {
      setError('Configure an AI provider first (Credentials page).');
      return;
    }
    setBusy(true);
    setError(null);
    setRaw('');
    try {
      const conv = await chatApi.createConversation('AI workflow');
      const systemPrompt = `You are FlowBot AI Studio's workflow generator.
Return ONLY a valid JSON object. No markdown fences, no prose, no explanations.
Shape: {"name":"Short name","graph":{"nodes":[...],"edges":[...]}}
Allowed node types: ${NODE_REGISTRY.map((n) => n.type).join(', ')}.
Node shape: {"id":"n_1","type":"manualTrigger","position":{"x":0,"y":0},"data":{...}}
Edge shape: {"id":"e_1","source":"n_1","sourceHandle":"out","target":"n_2","targetHandle":"payload"}
Rules: exactly one trigger; use real handle ids from the node definitions; connect sourceHandle to targetHandle; keep data values simple; no extra text.`;
      const res = await chatApi.send(conv.conversation.id, {
        content: text,
        provider,
        model,
        credentialId: credentialId || undefined,
        systemPrompt,
      });
      const rawText = res.assistantMessage.content;
      setRaw(rawText);
      const parsed = parseWorkflowJson(rawText);
      const graph = normalizeGraph(parsed.graph);
      const issues = validateGraph(graph);
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length > 0) throw new Error(`AI graph is invalid: ${errors[0].message}`);
      const created = await workflowsApi.create({ name: parsed.name || 'AI workflow' });
      await workflowsApi.save(created.workflow.id, { graph });
      toast('Workflow generated', 'success');
      onClose();
      navigate(`/workflows/${created.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="AI Workflow Builder">
      <div className="ai-builder-head">
        <Sparkles size={18} />
        <div>
          <b>Describe your automation</b>
          <div className="hint">AI writes a workflow JSON graph you can review, run, and edit.</div>
        </div>
      </div>

      {!config ? (
        <div className="small dim" style={{ padding: 10 }}>Loading AI configuration…</div>
      ) : !config.configured ? (
        <div className="chat-empty" style={{ padding: 20 }}>
          <Bot size={28} />
          <h3>Configure an AI provider</h3>
          <p className="small dim">Add an API key on the Credentials page, or enable Cloudflare Workers AI.</p>
          <Link className="btn btn-primary" to="/credentials" onClick={onClose}>Open Credentials</Link>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ai-wf-prompt">What should the workflow do?</label>
            <textarea
              id="ai-wf-prompt"
              className="textarea"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. When a Telegram message arrives, ask OpenAI for a reply, then send it back to Telegram."
            />
          </div>
          <div className="ai-builder-row">
            <div className="field">
              <label>Provider</label>
              <Combobox
                value={provider}
                options={(config.providers ?? []).map((p) => ({ value: p.id, label: p.label }))}
                onChange={changeProvider}
                allowEmpty={false}
                ariaLabel="Provider"
              />
            </div>
            <div className="field">
              <label>Model</label>
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model" />
            </div>
          </div>
          {providerCreds.length > 0 && (
            <div className="field">
              <label>Credential</label>
              <Combobox
                value={credentialId}
                options={providerCreds.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setCredentialId}
                emptyLabel="Auto (latest)"
                ariaLabel="Credential"
              />
            </div>
          )}
          {error && <div className="chat-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
          {raw && (
            <details className="ai-raw">
              <summary>AI response</summary>
              <pre>{raw}</pre>
            </details>
          )}
          <button className="btn btn-primary btn-block" onClick={() => void generate()} disabled={busy || !prompt.trim()}>
            {busy ? <span className="spinner" /> : <><Wand2 size={17} /> Generate workflow</>}
          </button>
          <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
            {providerMeta?.label || provider} · AI may make mistakes — review the graph before running.
          </div>
        </>
      )}
    </Sheet>
  );
}
