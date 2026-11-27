import { describe, expect, it } from 'vitest';
import { PUBLIC_MESSAGE_TTL_MS } from '../src/routes/chat';

describe('public chat retention', () => {
  it('keeps public messages for 24 hours', () => {
    expect(PUBLIC_MESSAGE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
