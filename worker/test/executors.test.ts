import { describe, it, expect } from 'vitest';
import type { FlowNode } from '@flowbot/shared';
import { NODE_REGISTRY } from '@flowbot/shared';
import type { NodeExecutionContext } from '../src/types';
import { executors, getExecutor } from '../src/engine/executors';

describe('executor registry coverage', () => {
  it('has an executor for EVERY registered node type', () => {
    const missing = NODE_REGISTRY
      .map((n) => n.type)
      .filter((type) => !getExecutor(type));
    expect(missing).toEqual([]);
  });

  it('has no executor keys that are not real node types', () => {
    const known = new Set(NODE_REGISTRY.map((n) => n.type));
    const orphans = Object.keys(executors).filter((k) => !known.has(k));
    expect(orphans).toEqual([]);
  });
});

function makeCtx(overrides: Partial<Pick<NodeExecutionContext, 'input' | 'outputs'>> = {}): NodeExecutionContext {
  const inputs: Record<string, unknown> = { ...(overrides.input ?? {}) };
  return {
    env: {} as never,
    workspaceId: 'ws_test',
    executionId: 'ex_test',
    triggerType: 'manual',
    input: overrides.input ?? {},
    outputs: overrides.outputs ?? {},
    vault: {
      get: async () => ({ apiKey: 'test-key' }),
      botToken: async () => 'test-bot-token',
    },
    vaultForAgent: async () => ({}),
    output: (handle: string) => inputs[handle],
    log: async () => undefined,
  } as NodeExecutionContext;
}

function node(type: string, data: Record<string, unknown>): FlowNode {
  return { id: type, type, position: { x: 0, y: 0 }, data };
}

describe('if node', () => {
  it('routes truthy to true output', async () => {
    const ctx = makeCtx({ outputs: {} });
    const res = await executors["if"].execute(ctx, node('if', { left: 'hello', operator: 'truthy', right: '' }));
    expect(res.outputs.true).toBe('hello');
    expect(res.outputs.false).toBeUndefined();
  });

  it('routes equality', async () => {
    const ctx = makeCtx();
    const res = await executors["if"].execute(ctx, node('if', { left: '5', operator: 'eq', right: '5' }));
    expect(res.outputs.true).toBe('5');
    const res2 = await executors["if"].execute(ctx, node('if', { left: '5', operator: 'neq', right: '6' }));
    expect(res2.outputs.true).toBe('5');
  });
});

describe('switch node', () => {
  it('matches a case', async () => {
    const ctx = makeCtx();
    const res = await executors.switch.execute(ctx, node('switch', { value: 'b', cases: 'a,b,c' }));
    expect(res.outputs.case1).toBe('b');
    expect(res.outputs.default).toBeUndefined();
  });

  it('falls to default', async () => {
    const ctx = makeCtx();
    const res = await executors.switch.execute(ctx, node('switch', { value: 'z', cases: 'a,b,c' }));
    expect(res.outputs.default).toBe('z');
  });
});

describe('set node', () => {
  it('transforms payload via dotted paths', async () => {
    const ctx = makeCtx({ outputs: { set: { payload: { user: { name: 'A' } } } } });
    ctx.output = () => ({ user: { name: 'A' } });
    const res = await executors.set.execute(ctx, node('set', { mapping: '{"user.name":"B","ok":true}' }));
    expect(res.outputs.payload).toEqual({ user: { name: 'B' }, ok: true });
  });
});

describe('manual trigger', () => {
  it('passes input through', async () => {
    const ctx = makeCtx({ input: { hello: 'world' } });
    const res = await executors.manualTrigger.execute(ctx, node('manualTrigger', {}));
    expect(res.outputs.out).toEqual({ hello: 'world' });
  });
});

describe('webhook trigger', () => {
  it('splits payload/headers/query', async () => {
    const ctx = makeCtx({ input: { user: 'x', __headers: { h: '1' }, __query: { q: '2' } } });
    const res = await executors.webhookTrigger.execute(ctx, node('webhookTrigger', {}));
    expect(res.outputs.payload).toEqual({ user: 'x', __headers: { h: '1' }, __query: { q: '2' } });
    expect(res.outputs.headers).toEqual({ h: '1' });
    expect(res.outputs.query).toEqual({ q: '2' });
  });
});

describe('http request node', () => {
  it('performs a GET and returns status+body', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, _init) => {
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    try {
      const ctx = makeCtx();
      const res = await executors.httpRequest.execute(
        ctx,
        node('httpRequest', { method: 'GET', url: 'https://example.com/api', headers: '{}', body: 'none', timeout: 5 }),
      );
      expect(res.outputs.status).toBe(200);
      expect(res.outputs.body).toEqual({ ok: true });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});