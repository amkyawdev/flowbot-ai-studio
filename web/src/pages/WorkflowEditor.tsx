import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Plus, Play, Square, Undo2, Redo2, Save, Check, AlertTriangle, Trash2 } from 'lucide-react';
import { getNodeDefinition, validateGraph } from '@flowbot/shared';
import { useWorkflow } from '@/store/workflow';
import { useApp } from '@/store/app';
import { NodeCard } from '@/editor/NodeCard';
import { NodeLibrary } from '@/editor/NodeLibrary';
import { NodeConfigSheet } from '@/editor/NodeConfigSheet';

const nodeTypes = { default: NodeCard };

export function WorkflowEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useApp((s) => s.toast);
  const store = useWorkflow();

  const [nodes, setNodes] = useNodesState(store.nodes);
  const [edges, setEdges] = useEdgesState(store.edges);

  useEffect(() => {
    if (!id) return;
    useWorkflow.getState().load(id).catch((e) => toast(e.message, 'error'));
  }, [id]);

  useEffect(() => {
    // Hydrate autosave if the workflow failed to load into a fresh store.
    if (store.nodes.length === 0) useWorkflow.getState().hydrateFromStorage();
  }, []);

  // Keep ReactFlow state in sync with zustand.
  useEffect(() => setNodes(store.nodes), [store.nodes]);
  useEffect(() => setEdges(store.edges), [store.edges]);

  // Autosave on connect/node change.
  useEffect(() => {
    const t = setTimeout(() => void useWorkflow.getState().autosave(), 900);
    return () => clearTimeout(t);
  }, [nodes, edges, store.name]);

  // Keyboard shortcuts for undo/redo/delete.
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

  const issues = useMemo(() => validateGraph({ nodes: store.nodes.map((n) => ({ id: n.id, type: n.type!, position: n.position, data: n.data })), edges: store.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? '', target: e.target, targetHandle: e.targetHandle ?? '' })) }), [store.nodes, store.edges]);
  const errors = issues.filter((i) => i.severity === 'error');

  async function run() {
    if (errors.length > 0) {
      toast(`Validation: ${errors[0].message}`, 'error');
      return;
    }
    try {
      await useWorkflow.getState().run();
      toast('Execution finished', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Run failed', 'error');
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <button className="btn-icon btn-ghost" onClick={() => { void useWorkflow.getState().save(); navigate('/workflows'); }} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <input className="input" style={{ flex: 1, minHeight: 40, background: 'transparent', border: 'none' }} value={store.name}
          onChange={(e) => store.setName(e.target.value)} aria-label="Workflow name" />
        <button className="btn-icon btn-ghost hidden-mobile" onClick={() => useWorkflow.getState().undo()} aria-label="Undo" disabled={store.past.length === 0}><Undo2 size={19} /></button>
        <button className="btn-icon btn-ghost hidden-mobile" onClick={() => useWorkflow.getState().redo()} aria-label="Redo" disabled={store.future.length === 0}><Redo2 size={19} /></button>
        <button className="btn-icon btn-ghost" onClick={() => void useWorkflow.getState().save()} aria-label="Save" title={store.savedAt ? `Saved ${new Date(store.savedAt).toLocaleTimeString()}` : 'Save'}>
          {store.saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Save size={19} />}
        </button>
        <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => useWorkflow.getState().toggleLibrary()}><Plus size={17} /> Add</button>
        <button className="btn" style={{ minHeight: 40 }} onClick={() => void run()} disabled={store.running}>
          {store.running ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <Play size={17} />} Run
        </button>
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
    </div>
  );
}