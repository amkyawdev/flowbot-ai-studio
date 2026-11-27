import { describe, it, expect } from 'vitest';
import { validateGraph, topoSort, renderTemplate, setPath, getPath, NODE_REGISTRY } from '@flowbot/shared';
import type { WorkflowGraph } from '@flowbot/shared';

describe('graph validation', () => {
  it('accepts a valid single-trigger graph', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'manualTrigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'httpRequest', position: { x: 0, y: 0 }, data: { method: 'GET', url: 'https://example.com' } },
      ],
      edges: [{ id: 'e1', source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'value' }],
    };
    expect(validateGraph(graph).filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('flags missing trigger', () => {
    const graph: WorkflowGraph = {
      nodes: [{ id: 'a', type: 'httpRequest', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    };
    const errors = validateGraph(graph).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('trigger'))).toBe(true);
  });

  it('flags unknown node type', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'manualTrigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'nonexistentNode', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    };
    const errors = validateGraph(graph).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('Unknown node type'))).toBe(true);
  });

  it('reports required config fields', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'manualTrigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'httpRequest', position: { x: 0, y: 0 }, data: { method: 'GET', url: '' } },
      ],
      edges: [],
    };
    const errors = validateGraph(graph).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('URL'))).toBe(true);
  });
});

describe('topological sort', () => {
  it('returns a valid order', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', type: 'manualTrigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'a', type: 'set', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'set', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: '1', source: 't', sourceHandle: 'out', target: 'a', targetHandle: 'value' },
        { id: '2', source: 'a', sourceHandle: 'payload', target: 'b', targetHandle: 'value' },
      ],
    };
    const order = topoSort(graph);
    expect(order).not.toBeNull();
    expect(order!.indexOf('t')).toBeLessThan(order!.indexOf('a'));
    expect(order!.indexOf('a')).toBeLessThan(order!.indexOf('b'));
  });

  it('returns null on cycle', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'set', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'set', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: '1', source: 'a', sourceHandle: 'payload', target: 'b', targetHandle: 'value' },
        { id: '2', source: 'b', sourceHandle: 'payload', target: 'a', targetHandle: 'value' },
      ],
    };
    expect(topoSort(graph)).toBeNull();
  });
});

describe('template rendering', () => {
  it('renders handlebars against context', () => {
    const ctx = { input: { user: { name: 'Alice' } } };
    expect(renderTemplate('Hello {{input.user.name}}!', ctx)).toBe('Hello Alice!');
    expect(renderTemplate('No-op {{missing}} here', ctx)).toBe('No-op  here');
  });
});

describe('path set/get', () => {
  it('sets and gets deep paths', () => {
    const obj: Record<string, unknown> = {};
    setPath(obj, 'a.b.c', 42);
    expect(getPath(obj, 'a.b.c')).toBe(42);
  });
});

describe('node registry', () => {
  it('exposes all required node types', () => {
    const required = [
      'manualTrigger', 'webhookTrigger', 'telegramTrigger', 'telegramSend', 'aiAgent',
      'openaiChat', 'gemini', 'httpRequest', 'if', 'switch', 'set', 'delay',
      'zillizSearch', 'zillizInsert', 'errorHandler',
    ];
    const types = NODE_REGISTRY.map((n) => n.type);
    for (const r of required) expect(types).toContain(r);
  });
});