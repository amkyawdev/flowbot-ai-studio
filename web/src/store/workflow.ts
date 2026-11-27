import { create } from 'zustand';
import type { Node, Edge, OnConnect, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { getNodeDefinition } from '@flowbot/shared';
import { uuid } from '@flowbot/shared';
import { workflowsApi } from '@/api/client';

const AUTOSAVE_KEY = 'flowbot_autosave';

interface WorkflowState {
  id: string | null;
  name: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  libraryOpen: boolean;
  running: boolean;
  runResult: any | null;
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
  addNode: (type: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  toggleLibrary: () => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
  autosave: () => Promise<void>;
  run: () => Promise<void>;
  stop: () => void;
  setName: (name: string) => void;
  hydrateFromStorage: () => boolean;
  clearRun: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

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
    runResult: null,
    saving: false,
    savedAt: null,
    past: [],
    future: [],

    setName(name) { set({ name }); },

    hydrateFromStorage() {
      try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        set({ nodes: data?.nodes ?? [], edges: data?.edges ?? [], name: data?.name ?? data?.id ? get().name : 'Untitled workflow' });
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
      });
    },

    setNodes(nodes) { set({ nodes }); },
    setEdges(edges) { set({ edges }); },

    onNodesChange(changes) {
      set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
    },

    onEdgesChange(changes) {
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
    },

    onConnect(connection) {
      pushHistory(get().nodes, get().edges);
      set((s) => ({ edges: addEdge({ ...connection, id: `e_${uuid()}` }, s.edges) }));
    },

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
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ name, nodes, edges }));
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void get().save(), 1200);
    },

    async run() {
      const { id, nodes, edges, name } = get();
      if (!id) return;
      set({ running: true, runResult: null });
      try {
        const res = await workflowsApi.run(id, {
          input: { __values: Object.fromEntries(nodes.map((n) => [n.id, n.data])) },
          async: false,
        });
        set({ runResult: res, running: false });
      } catch (e) {
        set({ running: false, runResult: { error: e instanceof Error ? e.message : 'Run failed' } });
        throw e;
      } finally {
        // Remove run-specific name reference if unused.
        void name;
      }
    },

    stop() { set({ running: false }); },

    clearRun() { set({ runResult: null }); },
  };
});