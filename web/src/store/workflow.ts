import { create } from 'zustand';
import type { Node, Edge, OnConnect, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { getNodeDefinition } from '@flowbot/shared';
import { uuid } from '@flowbot/shared';
import { workflowsApi, executionsApi } from '@/api/client';

const LEGACY_AUTOSAVE_KEY = 'flowbot_autosave';
const autosaveKey = (id: string) => `flowbot_autosave:${id}`;

export type RunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'stopped';

interface WorkflowState {
  id: string | null;
  name: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  libraryOpen: boolean;
  running: boolean;
  executionId: string | null;
  runStatus: RunStatus;
  runLogs: any[];
  runError: string | null;
  saving: boolean;
  savedAt: number | null;

  // history
  past: Array<{ nodes: Node[]; edges: Edge[] }>;
  future: Array<{ nodes: Node[]; edges: Edge[] }>;

  load: (id: string) => Promise<void>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  pushHistory: () => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  deleteWorkflow: () => Promise<void>;
  toggleLibrary: () => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  autosave: () => Promise<void>;
  run: (input?: Record<string, unknown>) => Promise<void>;
  stop: () => Promise<void>;
  setName: (name: string) => void;
  hydrateFromStorage: (id?: string) => boolean;
  replaceGraph: (payload: { name?: string; nodes: Node[]; edges: Edge[] }) => void;
  clearRun: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let runPollToken = 0;

function snapshot(nodes: Node[], edges: Edge[]) {
  return { nodes: structuredClone(nodes), edges: structuredClone(edges) };
}

export const useWorkflow = create<WorkflowState>((set, get) => {
  const pushHistory = (nodes: Node[], edges: Edge[]) => {
    const { past } = get();
    set({ past: [...past.slice(-49), snapshot(nodes, edges)], future: [] });
  };

  return {
    id: null,
    name: 'Untitled workflow',
    nodes: [],
    edges: [],
    selectedNodeId: null,
    libraryOpen: false,
    running: false,
    executionId: null,
    runStatus: 'idle',
    runLogs: [],
    runError: null,
    saving: false,
    savedAt: null,
    past: [],
    future: [],

    setName(name) { set({ name }); },

    hydrateFromStorage(id) {
      try {
        const raw = localStorage.getItem(id ? autosaveKey(id) : LEGACY_AUTOSAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        set({
          nodes: data?.nodes ?? [],
          edges: data?.edges ?? [],
          name: typeof data?.name === 'string' && data.name ? data.name : get().name,
        });
        return (data?.nodes?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },

    async load(id) {
      const res = await workflowsApi.get(id);
      const wf = res.workflow;
      const rawNodes = (wf.graph?.nodes ?? []).map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { ...(getNodeDefinition(n.type)?.defaults ?? {}), ...(n.data ?? {}) },
      }));
      const edges = (wf.graph?.edges ?? []).map((e: any) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        targetHandle: e.targetHandle ?? null,
      }));
      set({
        id: wf.id,
        name: wf.name,
        nodes: rawNodes,
        edges,
        past: [], future: [],
        selectedNodeId: null,
        runStatus: 'idle', runLogs: [], runError: null, executionId: null,
      });
    },

    setNodes(nodes) { set({ nodes }); },
    setEdges(edges) { set({ edges }); },

    onNodesChange(changes) {
      // Keyboard delete and multi-delete go through here; make them undoable.
      if (changes.some((c) => c.type === 'remove')) pushHistory(get().nodes, get().edges);
      set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
    },

    onEdgesChange(changes) {
      if (changes.some((c) => c.type === 'remove')) pushHistory(get().nodes, get().edges);
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
    },

    onConnect(connection) {
      pushHistory(get().nodes, get().edges);
      set((s) => ({ edges: addEdge({ ...connection, id: `e_${uuid()}` }, s.edges) }));
    },

    pushHistory() { pushHistory(get().nodes, get().edges); },

    addNode(type, position) {
      pushHistory(get().nodes, get().edges);
      const def = getNodeDefinition(type);
      const id = `n_${uuid().slice(0, 10)}`;
      const node: Node = {
        id,
        type,
        position: position || { x: 0, y: 0 },
        data: { ...(def?.defaults ?? {}) },
      };
      set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id, libraryOpen: false }));
    },

    selectNode(id) { set({ selectedNodeId: id }); },

    updateNodeData(id, data) {
      pushHistory(get().nodes, get().edges);
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      }));
      void get().autosave();
    },

    removeNode(id) {
      pushHistory(get().nodes, get().edges);
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedNodeId: null,
      }));
    },

    duplicateNode(id) {
      const src = get().nodes.find((n) => n.id === id);
      if (!src) return;
      pushHistory(get().nodes, get().edges);
      const newId = `n_${uuid().slice(0, 10)}`;
      const copy = {
        ...structuredClone(src),
        id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
      };
      set((s) => ({ nodes: [...s.nodes, copy], selectedNodeId: newId }));
    },

    async deleteWorkflow() {
      const { id } = get();
      if (!id) return;
      await workflowsApi.remove(id);
      localStorage.removeItem(autosaveKey(id));
      set({ id: null, nodes: [], edges: [], past: [], future: [] });
    },

    toggleLibrary() { set((s) => ({ libraryOpen: !s.libraryOpen })); },

    undo() {
      const { past, future, nodes, edges } = get();
      if (past.length === 0) return;
      const last = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [...future, snapshot(nodes, edges)],
        nodes: last.nodes,
        edges: last.edges,
      });
    },

    redo() {
      const { past, future, nodes, edges } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      set({
        future: future.slice(0, -1),
        past: [...past, snapshot(nodes, edges)],
        nodes: next.nodes,
        edges: next.edges,
      });
    },

    async save() {
      const { id, name, nodes, edges } = get();
      if (!id) return;
      set({ saving: true });
      try {
        await workflowsApi.save(id, {
          name,
          graph: {
            nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
            edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
          },
        });
        set({ savedAt: Date.now() });
      } finally {
        set({ saving: false });
      }
    },

    async autosave() {
      const { id, name, nodes, edges } = get();
      if (id) localStorage.setItem(autosaveKey(id), JSON.stringify({ name, nodes, edges }));
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { void get().save().catch(() => undefined); }, 1200);
    },

    async run(input = {}) {
      const { id } = get();
      if (!id) return;
      const token = ++runPollToken;
      set({ running: true, runStatus: 'queued', runLogs: [], runError: null, executionId: null });
      try {
        const res = await workflowsApi.run(id, { input, async: true }) as { executionId?: string; status?: string };
        const execId = res?.executionId ?? null;
        if (!execId) throw new Error('No execution id returned');
        set({ executionId: execId, runStatus: (res.status as RunStatus) || 'queued' });

        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 800));
          if (token !== runPollToken) return;
          const detail = await executionsApi.get(execId);
          const status = detail.execution.status as RunStatus;
          set({ runLogs: detail.logs, runStatus: status });
          if (status === 'success' || status === 'error' || status === 'stopped') {
            set({
              running: false,
              runError: status === 'error' ? (detail.execution.error_message || 'Execution failed') : null,
            });
            return;
          }
        }
        set({ running: false, runStatus: 'error', runError: 'Timed out waiting for the execution to finish.' });
      } catch (e) {
        set({ running: false, runStatus: 'error', runError: e instanceof Error ? e.message : 'Run failed' });
        throw e;
      }
    },

    async stop() {
      const { executionId } = get();
      runPollToken += 1;
      if (executionId) {
        try { await executionsApi.stop(executionId); } catch { /* ignore */ }
      }
      set({ running: false, runStatus: 'stopped' });
    },

    replaceGraph({ name, nodes, edges }) {
      pushHistory(get().nodes, get().edges);
      set({ nodes, edges, name: name ?? get().name, selectedNodeId: null });
      void get().autosave();
    },

    clearRun() { set({ runStatus: 'idle', runLogs: [], runError: null, executionId: null }); },
  };
});
