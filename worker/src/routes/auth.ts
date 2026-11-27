import { Hono } from 'hono';
import type { Env } from '../types';
import { hashPassword, randomId, randomToken, sha256Hex, timingSafeEqual } from '../crypto';
import { AppEnv, authMiddleware, jsonResponse, workspaceForUser } from '../utils';
import { emailConfigured, otpEmail, sendEmail } from '../integrations/email';
import { generateOtp, hashOtp, isValidOtpFormat, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from '../otp';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const OTP_REQUEST_WINDOW_SECONDS = 60;

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
};

function loginKey(c: { req: { header(name: string): string | undefined } }, email: string): string {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown';
  return `login_fail:${ip}:${email}`;
}

async function bumpLoginFailure(kv: KVNamespace, key: string): Promise<void> {
  const current = Number(await kv.get(key)) || 0;
  await kv.put(key, String(current + 1), { expirationTtl: LOGIN_WINDOW_SECONDS });
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?')
    .bind(email).first<UserRow>();
}

async function issueSession(c: import('hono').Context<AppEnv>, user: UserRow) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(`s_${randomId()}`, user.id, tokenHash, expiry).run();
  const workspace = await workspaceForUser(c, { id: user.id, email: user.email, displayName: user.display_name });
  return {
    token,
    user: { id: user.id, email: user.email, displayName: user.display_name },
    workspace,
  };
}

async function sendOtp(env: Env, email: string, purpose: 'login' | 'register'): Promise<{ devCode?: string }> {
  const code = generateOtp();
  const id = `otp_${randomId()}`;
  const codeHash = await hashOtp(email, purpose, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_otps SET consumed = 1 WHERE email = ? AND purpose = ? AND consumed = 0').bind(email, purpose),
    env.DB.prepare(
      'INSERT INTO email_otps (id, email, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, email, purpose, codeHash, expiresAt),
  ]);
  if (emailConfigured(env)) {
    const mail = otpEmail(code, purpose);
    await sendEmail(env, { to: email, ...mail });
  }
  return { devCode: env.OTP_DEV_ECHO === 'true' ? code : undefined };
}

function otpAvailable(env: Env): boolean {
  return emailConfigured(env) || env.OTP_DEV_ECHO === 'true';
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  const displayName = String(body?.displayName || '').trim() || email.split('@')[0];

  if (!validEmail(email)) return jsonResponse({ error: 'Invalid email address' }, 400);
  if (password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'An account with this email already exists' }, 409);

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = `u_${randomId()}`;
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
  ).bind(userId, email, displayName, passwordHash, salt).run();

  const user = { id: userId, email, displayName };
  if (!otpAvailable(c.env)) {
    return jsonResponse({ user, otpRequired: false, emailConfigured: false }, 201);
  }

  const rateKey = `otp_req:${email}`;
  if (await c.env.KV.get(rateKey)) {
    return jsonResponse({ user, otpRequired: false, emailConfigured: true, warning: 'A code was requested recently. Sign in with your password or try again shortly.' }, 201);
  }
  await c.env.KV.put(rateKey, '1', { expirationTtl: OTP_REQUEST_WINDOW_SECONDS });

  try {
    const otp = await sendOtp(c.env, email, 'register');
    return jsonResponse({ user, otpRequired: true, emailConfigured: true, devCode: otp.devCode }, 201);
  } catch (e) {
    return jsonResponse({
      user,
      otpRequired: false,
      emailConfigured: true,
      warning: e instanceof Error ? e.message : 'Verification email could not be sent',
    }, 201);
  }
});

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');

  const key = loginKey(c, email);
  const fails = Number(await c.env.KV.get(key)) || 0;
  if (fails >= LOGIN_MAX_FAILS) {
    return new Response(JSON.stringify({ error: 'Too many sign-in attempts. Try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(LOGIN_WINDOW_SECONDS) },
    });
  }

  const user = await getUserByEmail(c.env, email);
  if (!user) {
    await bumpLoginFailure(c.env.KV, key);
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  const hash = await hashPassword(password, user.password_salt);
  if (!timingSafeEqual(hash, user.password_hash)) {
    await bumpLoginFailure(c.env.KV, key);
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }
  await c.env.KV.delete(key).catch(() => undefined);

  // Optional/required email-code second step.
  const mode = c.env.AUTH_OTP_MODE || 'optional';
  if (mode === 'required' && otpAvailable(c.env)) {
    try {
      const otp = await sendOtp(c.env, email, 'login');
      return jsonResponse({ otpRequired: true, email, devCode: otp.devCode });
    } catch {
      // Fall back to password login rather than locking the user out.
    }
  }

  return jsonResponse(await issueSession(c, user));
});

authRoutes.get('/auth/otp/status', (c) => jsonResponse({
  available: otpAvailable(c.env),
  mode: c.env.AUTH_OTP_MODE || 'optional',
}));

authRoutes.post('/auth/otp/request', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const purpose = String(body?.purpose || 'login');
  if (!validEmail(email)) return jsonResponse({ error: 'Invalid email address' }, 400);
  if (purpose !== 'login' && purpose !== 'register') return jsonResponse({ error: 'Invalid purpose' }, 400);
  if (!otpAvailable(c.env)) {
    return jsonResponse({ error: 'Email is not configured. Set RESEND_API_KEY and EMAIL_FROM.', emailConfigured: false }, 503);
  }

  const key = `otp_req:${email}`;
  if (await c.env.KV.get(key)) {
    return new Response(JSON.stringify({ error: 'A code was sent recently. Wait a minute before requesting another.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(OTP_REQUEST_WINDOW_SECONDS) },
    });
  }
  await c.env.KV.put(key, '1', { expirationTtl: OTP_REQUEST_WINDOW_SECONDS });

  // Do not reveal whether the account exists.
  const user = await getUserByEmail(c.env, email);
  if (!user) return jsonResponse({ ok: true, expiresIn: Math.floor(OTP_TTL_MS / 1000) });

  try {
    const otp = await sendOtp(c.env, email, purpose as 'login' | 'register');
    return jsonResponse({ ok: true, expiresIn: Math.floor(OTP_TTL_MS / 1000), devCode: otp.devCode });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Verification email could not be sent' }, 502);
  }
});

authRoutes.post('/auth/otp/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || '').trim();
  const purpose = String(body?.purpose || 'login');
  if (!validEmail(email) || !isValidOtpFormat(code)) return jsonResponse({ error: 'Invalid email or code' }, 400);
  if (purpose !== 'login' && purpose !== 'register') return jsonResponse({ error: 'Invalid purpose' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT id, code_hash, expires_at, attempts FROM email_otps WHERE email = ? AND purpose = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1',
  ).bind(email, purpose).first<{ id: string; code_hash: string; expires_at: string; attempts: number }>();
  if (!row) return jsonResponse({ error: 'Code expired or not requested' }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return jsonResponse({ error: 'Code expired' }, 400);
  if (row.attempts >= OTP_MAX_ATTEMPTS) return jsonResponse({ error: 'Too many attempts. Request a new code.' }, 429);

  const expected = await hashOtp(email, purpose, code);
  if (!timingSafeEqual(expected, row.code_hash)) {
    await c.env.DB.prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    return jsonResponse({ error: 'Invalid code' }, 400);
  }

  await c.env.DB.prepare('UPDATE email_otps SET consumed = 1 WHERE id = ?').bind(row.id).run();
  const user = await getUserByEmail(c.env, email);
  if (!user) return jsonResponse({ error: 'Account not found' }, 400);

  if (purpose === 'register') {
    await c.env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(user.id).run().catch(() => undefined);
  }

  return jsonResponse(await issueSession(c, user));
});

authRoutes.post('/auth/logout', async (c) => {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return jsonResponse({ ok: true });
});

authRoutes.get('/auth/me', authMiddleware, async (c) => {
  const app = c.get('app');
  return jsonResponse({ user: app.user, workspace: app.workspace });
});
