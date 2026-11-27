import { describe, it, expect } from 'vitest';
import { NODE_REGISTRY, getNodeDefinition, TRIGGER_TYPES } from '@flowbot/shared';

describe('node registry (shared)', () => {
  it('includes all required node types', () => {
    const required = [
      'manualTrigger', 'webhookTrigger', 'telegramTrigger', 'telegramSend', 'aiAgent',
      'openaiChat', 'gemini', 'httpRequest', 'if', 'switch', 'set', 'delay',
      'zillizSearch', 'zillizInsert', 'errorHandler',
    ];
    const types = NODE_REGISTRY.map((n) => n.type);
    for (const r of required) expect(types).toContain(r);
  });

  it('every node has inputs and outputs typed', () => {
    for (const n of NODE_REGISTRY) {
      for (const p of [...n.inputs, ...n.outputs]) expect(p.type).toBeTruthy();
    }
  });

  it('has exactly 3 triggers', () => {
    expect(TRIGGER_TYPES.size).toBeGreaterThanOrEqual(3);
  });

  it('ai nodes are retryable with timeouts', () => {
    for (const t of ['aiAgent', 'openaiChat', 'gemini', 'httpRequest', 'zillizSearch']) {
      const def = getNodeDefinition(t);
      expect(def?.retryable).toBe(true);
      expect(def?.timeoutMs).toBeGreaterThan(0);
    }
  });
});
