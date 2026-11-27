import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Plus, Play, Square, Undo2, Redo2, Save, Check, AlertTriangle, Trash2, Download, Upload,
} from 'lucide-react';
import { getNodeDefinition, validateGraph } from '@flowbot/shared';
import { useWorkflow } from '@/store/workflow';
import { useApp } from '@/store/app';
import { NodeCard } from '@/editor/NodeCard';
import { NodeLibrary } from '@/editor/NodeLibrary';
import { NodeConfigSheet } from '@/editor/NodeConfigSheet';
import { Sheet } from '@/components/ui';

const nodeTypes = { default: NodeCard };

export function WorkflowEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const store = useWorkflow();

  const [nodes, setNodes] = useNodesState(store.nodes);
  const [edges, setEdges] = useEdgesState(store.edges);
  const [runOpen, setRunOpen] = useState(false);
  const [runInput, setRunInput] = useState('{}');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    // Avoid showing the previous workflow's graph while the new one loads.
    if (useWorkflow.getState().id !== id) {
      useWorkflow.setState({ id: null, nodes: [], edges: [], selectedNodeId: null, name: 'Loading…' });
    }
    useWorkflow.getState().load(id)
      .then(() => {
        if (useWorkflow.getState().nodes.length === 0) useWorkflow.getState().hydrateFromStorage(id);
      })
      .catch((e) => toast(e instanceof Error ? e.message : 'Load failed', 'error'));
  }, [id, toast]);

  useEffect(() => setNodes(store.nodes), [store.nodes, setNodes]);
  useEffect(() => setEdges(store.edges), [store.edges, setEdges]);

  useEffect(() => {
    const t = setTimeout(() => void useWorkflow.getState().autosave(), 900);
    return () => clearTimeout(t);
  }, [nodes, edges, store.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useWorkflow.getState().redo();
        else useWorkflow.getState().undo();
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void useWorkflow.getState().save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const issues = useMemo(() => validateGraph({
    nodes: store.nodes.map((n) => ({ id: n.id, type: n.type!, position: n.position, data: n.data })),
    edges: store.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? '', target: e.target, targetHandle: e.targetHandle ?? '' })),
  }), [store.nodes, store.edges]);
  const errors = issues.filter((i) => i.severity === 'error');

  async function runNow() {
    let input: Record<string, unknown> = {};
    if (runInput.trim()) {
      try { input = JSON.parse(runInput); }
      catch { toast('Run input must be valid JSON', 'error'); return; }
    }
    if (errors.length > 0) { toast(`Validation: ${errors[0].message}`, 'error'); return; }
    try { await useWorkflow.getState().run(input); }
    catch (e) { toast(e instanceof Error ? e.message : 'Run failed', 'error'); }
  }

  function exportJson() {
    const payload = {
      version: 1,
      name: store.name,
      graph: {
        nodes: store.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: store.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(store.name || 'workflow').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { name?: string; graph?: any; nodes?: any[]; edges?: any[] };
        const graph = data.graph ?? data;
        const importedNodes = (graph.nodes ?? []).map((n: any) => ({
          id: String(n.id), type: String(n.type), position: n.position ?? { x: 0, y: 0 }, data: n.data ?? {},
        }));
        const importedEdges = (graph.edges ?? []).map((e: any, i: number) => ({
          id: String(e.id ?? `e_import_${i}`), source: String(e.source), sourceHandle: e.sourceHandle ?? null,
          target: String(e.target), targetHandle: e.targetHandle ?? null,
        }));
        if (importedNodes.length === 0) { toast('No nodes found in file', 'error'); return; }
        useWorkflow.getState().replaceGraph({ name: data.name ?? store.name, nodes: importedNodes, edges: importedEdges });
        toast('Workflow imported', 'success');
      } catch {
        toast('Invalid workflow JSON file', 'error');
      }
    };
    reader.readAsText(file);
  }

  const statusKind = store.runStatus === 'success' ? 'badge-success'
    : store.runStatus === 'error' ? 'badge-error'
      : store.runStatus === 'stopped' ? 'badge-warn'
        : 'badge-info';

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <button className="btn-icon btn-ghost" onClick={() => { void useWorkflow.getState().save(); navigate('/workflows'); }} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <input
          className="input"
          style={{ flex: 1, minHeight: 40, background: 'transparent', border: 'none', minWidth: 100 }}
          value={store.name}
          onChange={(e) => store.setName(e.target.value)}
          aria-label="Workflow name"
        />
        <button className="btn-icon btn-ghost" onClick={() => useWorkflow.getState().undo()} aria-label="Undo" disabled={store.past.length === 0}><Undo2 size={19} /></button>
        <button className="btn-icon btn-ghost" onClick={() => useWorkflow.getState().redo()} aria-label="Redo" disabled={store.future.length === 0}><Redo2 size={19} /></button>
        <button className="btn-icon btn-ghost" onClick={() => void useWorkflow.getState().save()} aria-label="Save" title={store.savedAt ? `Saved ${new Date(store.savedAt).toLocaleTimeString()}` : 'Save'}>
          {store.saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Save size={19} />}
        </button>
        <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => useWorkflow.getState().toggleLibrary()}><Plus size={17} /> Add</button>
        <button className="btn" style={{ minHeight: 40 }} onClick={() => setRunOpen(true)}><Play size={17} /> Run</button>
        <button className="btn-icon btn-ghost" onClick={exportJson} aria-label="Export JSON" title="Export JSON"><Download size={18} /></button>
        <button className="btn-icon btn-ghost" onClick={() => fileRef.current?.click()} aria-label="Import JSON" title="Import JSON"><Upload size={18} /></button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }}
        />
        <button className="btn-icon btn-ghost" style={{ color: 'var(--red)' }} aria-label="Delete workflow" title="Delete workflow"
          onClick={async () => {
            if (!confirm('Delete this workflow permanently?')) return;
            try { await useWorkflow.getState().deleteWorkflow(); toast('Workflow deleted', 'success'); navigate('/workflows'); }
            catch (e) { toast(e instanceof Error ? e.message : 'Delete failed', 'error'); }
          }}>
          <Trash2 size={18} />
        </button>
      </div>

      <div className="editor-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={store.onNodesChange}
          onEdgesChange={store.onEdgesChange}
          onConnect={store.onConnect}
          onNodeDragStart={() => useWorkflow.getState().pushHistory()}
          onNodeClick={(_, node) => useWorkflow.getState().selectNode(node.id)}
          onPaneClick={() => useWorkflow.getState().selectNode(null)}
          fitView
          minZoom={0.25}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Delete', 'Backspace']}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#ffffff08" />
          <MiniMap pannable zoomable style={{ background: '#101017' }} maskColor="rgba(255,255,255,0.06)" nodeColor={(n) => (n.type ? getNodeDefinition(n.type)?.color : undefined) ?? '#38bdf8'} />
          <Controls />
        </ReactFlow>

        {errors.length > 0 && (
          <div className="editor-float" style={{ top: 10, left: 10, right: 10, justifyContent: 'center' }}>
            <div className="badge badge-error" style={{ height: 34, fontSize: 12 }}><AlertTriangle size={14} /> {errors[0].message}</div>
          </div>
        )}
        {store.savedAt && (
          <div className="editor-float" style={{ bottom: 10, left: 10 }}>
            <div className="badge badge-success"><Check size={13} /> Saved {new Date(store.savedAt).toLocaleTimeString()}</div>
          </div>
        )}
      </div>

      <NodeLibrary />
      <NodeConfigSheet node={store.nodes.find((n) => n.id === store.selectedNodeId) ?? null} />

      <Sheet open={runOpen} onClose={() => setRunOpen(false)} title="Test & run">
        <div className="field">
          <label htmlFor="run-input">Input JSON</label>
          <textarea id="run-input" className="textarea mono" rows={5} value={runInput} onChange={(e) => setRunInput(e.target.value)} spellCheck={false} />
          <div className="hint">Passed to the trigger node as the workflow input.</div>
        </div>
        <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => void runNow()} disabled={store.running}>
            {store.running ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <Play size={16} />} Run
          </button>
          {store.running && <button className="btn btn-danger" onClick={() => void useWorkflow.getState().stop()}><Square size={15} /> Stop</button>}
          <span className={`badge ${statusKind}`}>{store.runStatus}</span>
        </div>
        {store.runError && <div className="chat-error" role="alert" style={{ marginBottom: 10 }}>{store.runError}</div>}
        <div className="section-title">Logs</div>
        <div className="glass" style={{ padding: 8, maxHeight: 280, overflow: 'auto' }}>
          {store.runLogs.length === 0 && <div className="small dim" style={{ padding: 10 }}>No logs yet. Run the workflow to see execution logs.</div>}
          {store.runLogs.map((log: any, i: number) => (
            <div key={i} className="flex" style={{ gap: 8, padding: '6px 8px', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
              <span className={`badge ${log.level === 'error' ? 'badge-error' : log.level === 'warn' ? 'badge-warn' : 'badge-info'}`} style={{ height: 20, flexShrink: 0 }}>{log.level}</span>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ wordBreak: 'break-word' }}>{log.message}</div>
                {log.node_type && <div className="small faint">{log.node_type}{log.node_id ? ` · ${String(log.node_id).slice(0, 10)}` : ''}</div>}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
