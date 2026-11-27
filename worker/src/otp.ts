import { sha256Hex } from './crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** Generate a uniform 6-digit one-time code. */
export function generateOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export function isValidOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Hash an OTP with its email + purpose so the raw code is never stored. */
export function hashOtp(email: string, purpose: string, code: string): Promise<string> {
  return sha256Hex(`${email.toLowerCase()}:${purpose}:${code}`);
}
