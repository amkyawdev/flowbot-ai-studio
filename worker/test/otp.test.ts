import { describe, expect, it } from 'vitest';
import { generateOtp, hashOtp, isValidOtpFormat, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../src/otp';

describe('email OTP helpers', () => {
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(isValidOtpFormat(code)).toBe(true);
    }
  });

  it('rejects invalid code formats', () => {
    expect(isValidOtpFormat('12345')).toBe(false);
    expect(isValidOtpFormat('1234567')).toBe(false);
    expect(isValidOtpFormat('abcdef')).toBe(false);
    expect(isValidOtpFormat('')).toBe(false);
  });

  it('hashes deterministically and normalizes the email', async () => {
    const a = await hashOtp('A@B.com', 'login', '123456');
    const b = await hashOtp('a@b.com', 'login', '123456');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('binds the hash to purpose and code', async () => {
    const base = await hashOtp('a@b.com', 'login', '123456');
    expect(await hashOtp('a@b.com', 'register', '123456')).not.toBe(base);
    expect(await hashOtp('a@b.com', 'login', '654321')).not.toBe(base);
  });

  it('uses a 10-minute TTL and 5 attempts', () => {
    expect(OTP_TTL_MS).toBe(600_000);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});
