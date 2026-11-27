import { describe, it, expect } from 'vitest';
import { createVault, hashPassword, timingSafeEqual } from '../src/crypto';

describe('crypto', () => {
  it('encrypts and decrypts round-trip', async () => {
    const vault = await createVault('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=');
    const secret = JSON.stringify({ apiKey: 'sk-test-123', baseUrl: 'https://example.com' });
    const cipher = await vault.encrypt(secret);
    expect(cipher).not.toContain('sk-test-123');
    const plain = await vault.decrypt(cipher);
    expect(plain).toBe(secret);
  });

  it('produces different ciphertext on each encrypt (random IV)', async () => {
    const vault = await createVault('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=');
    const a = await vault.encrypt('same');
    const b = await vault.encrypt('same');
    expect(a).not.toBe(b);
  });

  it('password hashing is salted', async () => {
    const h1 = await hashPassword('password123', 'saltA');
    const h2 = await hashPassword('password123', 'saltB');
    const h3 = await hashPassword('password123', 'saltA');
    expect(h1).not.toBe(h2);
    expect(h1).toBe(h3);
  });

  it('timingSafeEqual behaves correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});