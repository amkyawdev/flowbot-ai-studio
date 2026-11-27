import { describe, expect, it } from 'vitest';
import { redactForLog } from '../src/engine/runner';

describe('redactForLog', () => {
  it('redacts secret-looking keys recursively', () => {
    const out = redactForLog({
      apiKey: 'sk-1',
      nested: { authorization: 'Bearer x', ok: 'yes' },
      list: [{ token: 't' }],
    }) as Record<string, any>;
    expect(out.apiKey).toBe('[redacted]');
    expect(out.nested.authorization).toBe('[redacted]');
    expect(out.nested.ok).toBe('yes');
    expect(out.list[0].token).toBe('[redacted]');
  });

  it('truncates very long strings', () => {
    const out = redactForLog({ text: 'x'.repeat(3000) }) as Record<string, any>;
    expect(out.text.length).toBeLessThan(2100);
  });
});
