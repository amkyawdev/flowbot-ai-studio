/**
 * Web Crypto helpers: AES-256-GCM encryption for the secret vault and
 * PBKDF2 password hashing for auth. All crypto runs in the Worker runtime.
 */

const encoder = new TextEncoder();

export function randomId(prefix = '', hexBytes = 16): string {
  const bytes = new Uint8Array(hexBytes);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${hex}`;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export interface Vault {
  encrypt(plainText: string): Promise<string>;
  decrypt(payload: string): Promise<string>;
}

export async function createVault(masterKeyB64: string): Promise<Vault> {
  const key = await importKey(masterKeyB64);
  return {
    async encrypt(plainText: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(plainText),
      );
      const out = new Uint8Array(12 + cipher.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(cipher), 12);
      return btoa(String.fromCharCode(...out));
    },
    async decrypt(payload: string): Promise<string> {
      const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      const iv = raw.slice(0, 12);
      const data = raw.slice(12);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(plain);
    },
  };
}

async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

/** Cheap constant-time-ish string comparison for HMAC signature checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}