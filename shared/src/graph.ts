import type { FlowEdge, FlowNode, WorkflowGraph } from './types';
import { NODE_MAP, TRIGGER_TYPES } from './nodes';

export interface GraphValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

/** Verify a graph is well-formed and safely executable. */
export function validateGraph(graph: WorkflowGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  if (graph.nodes.length === 0) {
    issues.push({ severity: 'error', message: 'Workflow has no nodes.' });
    return issues;
  }

  for (const n of graph.nodes) {
    const def = NODE_MAP[n.type];
    if (!def) {
      issues.push({ severity: 'error', nodeId: n.id, message: `Unknown node type "${n.type}".` });
      continue;
    }
    for (const f of def.config) {
      if (f.required) {
        const v = n.data[f.key];
        if (v === undefined || v === null || v === '') {
          issues.push({ severity: 'error', nodeId: n.id, message: `"${def.name}" requires "${f.label}".` });
        }
      }
    }
  }

  for (const e of graph.edges) {
    if (!nodeIds.has(e.source)) issues.push({ severity: 'error', message: `Edge ${e.id} references missing node ${e.source}.` });
    if (!nodeIds.has(e.target)) issues.push({ severity: 'error', message: `Edge ${e.id} references missing node ${e.target}.` });
  }

  const triggers = graph.nodes.filter((n) => TRIGGER_TYPES.has(n.type));
  const hasErrorHandler = graph.nodes.some((n) => n.type === 'errorHandler');

  // Cycle detection via DFS.
  const order = topoSort(graph);
  if (order === null) {
    issues.push({ severity: 'error', message: 'Workflow contains a cycle and cannot run.' });
  }

  if (triggers.length === 0) {
    issues.push({ severity: 'error', message: 'Add a trigger node (Manual, Webhook or Telegram).' });
  }
  if (triggers.length > 1) {
    issues.push({ severity: 'error', message: 'Only one trigger node is allowed.' });
  }
  if (hasErrorHandler) {
    if (!graph.edges.some((e) => e.targetHandle === 'error' || e.target === graph.nodes.find((n) => n.type === 'errorHandler')?.id)) {
      issues.push({ severity: 'warning', message: 'Error handler exists but nothing feeds it.' });
    }
  }
  return issues;
}

/**
 * Topological sort (dependencies before dependents). Returns null on a cycle.
 * This is a Kahn's algorithm so the result is a valid execution order.
 */
export function topoSort(graph: WorkflowGraph): string[] | null {
  const adj = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of graph.nodes) {
    adj.set(n.id, []);
    indegree.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (adj.has(e.source) && indegree.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }
  const out: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== graph.nodes.length) return null;
  return out;
}

/** Incoming edges grouped by target node and handle. */
export function incomingEdgesByTarget(graph: WorkflowGraph): Record<string, FlowEdge[]> {
  const map: Record<string, FlowEdge[]> = {};
  for (const e of graph.edges) {
    (map[e.target] ??= []).push(e);
  }
  return map;
}

/** Outgoing edges grouped by source node. */
export function outgoingEdgesBySource(graph: WorkflowGraph): Record<string, FlowEdge[]> {
  const map: Record<string, FlowEdge[]> = {};
  for (const e of graph.edges) {
    (map[e.source] ??= []).push(e);
  }
  return map;
}

/** Find the single trigger node id, else null. */
export function findTrigger(graph: WorkflowGraph): FlowNode | undefined {
  return graph.nodes.find((n) => TRIGGER_TYPES.has(n.type));
}

/** Handlebars-ish template rendering against a payload + per-node outputs context. */
export function renderTemplate(template: string | undefined, ctx: Record<string, unknown>): string {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr: string) => {
    const trimmed = expr.trim();
    const val = getPath(ctx, trimmed);
    if (val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

/** Deep value access via dotted paths, e.g. "payload.user.name". */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.includes('.') ? path.split('.') : [path];
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Deep set via dotted path. */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}