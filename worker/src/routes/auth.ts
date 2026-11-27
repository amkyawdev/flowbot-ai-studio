import { Hono } from 'hono';
import type { Env } from '../types';
import { hashPassword, randomId, randomToken, sha256Hex } from '../crypto';
import { AppEnv, authMiddleware, jsonResponse, workspaceForUser } from '../utils';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const displayName = String(body?.displayName || '').trim() || email.split('@')[0];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResponse({ error: 'Invalid email address' }, 400);
  if (password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'An account with this email already exists' }, 409);

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = `u_${randomId()}`;
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
  ).bind(userId, email, displayName, passwordHash, salt).run();
  return jsonResponse({ user: { id: userId, email, displayName } }, 201);
});

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const user = await c.env.DB.prepare(
    'SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?',
  ).bind(email).first<{ id: string; email: string; display_name: string; password_hash: string; password_salt: string }>();
  if (!user) return jsonResponse({ error: 'Invalid email or password' }, 401);

  const hash = await hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return jsonResponse({ error: 'Invalid email or password' }, 401);

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(`s_${randomId()}`, user.id, tokenHash, expiry).run();

  const workspace = await workspaceForUser(c, { id: user.id, email: user.email, displayName: user.display_name });
  return jsonResponse({ token, user: { id: user.id, email: user.email, displayName: user.display_name }, workspace });
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