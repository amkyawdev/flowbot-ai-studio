import type { Context, Next } from 'hono';
import type { Env, SessionUser, WorkspaceRow } from './types';
import { sha256Hex } from './crypto';

export interface AppContext {
  user: SessionUser;
  workspace: WorkspaceRow;
}

/** Hono bindings + variables (always has `app` set after authMiddleware). */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    app: AppContext;
  };
};

export async function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parse a numeric page/limit with sane bounds. */
export function pageParams(url: URL): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Resolve the authenticated user + their active workspace for the request.
 * Requires `Authorization: Bearer <token>`.
 */
export async function resolveAuth(c: Context<AppEnv>): Promise<SessionUser | null> {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await c.env.DB.prepare(
    `SELECT s.user_id, s.expires_at, u.email, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  ).bind(tokenHash).first<{ user_id: string; expires_at: string; email: string; display_name: string }>();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  return {
    id: session.user_id,
    email: session.email,
    displayName: session.display_name || session.email.split('@')[0],
  };
}

/** Get (or lazily create) the user's personal workspace. */
export async function workspaceForUser(c: Context<AppEnv>, user: SessionUser): Promise<WorkspaceRow> {
  const ws = await c.env.DB.prepare(
    `SELECT w.id, w.name, w.slug FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = ? AND m.role = 'owner' ORDER BY w.created_at ASC LIMIT 1`,
  ).bind(user.id).first<WorkspaceRow>();
  if (ws) return ws;

  const slug = `ws-${user.id.slice(0, 8)}`;
  const id = `ws_${crypto.randomUUID()}`;
  const name = `${user.displayName || user.email.split('@')[0]}'s Workspace`;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO workspaces (id, name, slug, owner_user_id) VALUES (?, ?, ?, ?)').bind(id, name, slug, user.id),
    c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').bind(id, user.id, 'owner'),
  ]);
  return { id, name, slug };
}

/** Auth middleware; sets ctx.set('app', {user, workspace}). */
export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = await resolveAuth(c);
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const workspace = await workspaceForUser(c, user);
  c.set('app', { user, workspace });
  await next();
}

export function corsHeaders(env: Env, origin?: string | null): Record<string, string> {
  const configured = (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    'https://flowbot-ai-studio.amkyaw-dev.workers.dev',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
    'http://localhost:8100',
  ];
  let appOrigin = '';
  try { if (env.APP_BASE_URL) appOrigin = new URL(env.APP_BASE_URL).origin; } catch { /* ignore */ }
  const allowed = new Set([...defaults, ...(appOrigin ? [appOrigin] : []), ...configured]);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
  // Reflect only allowed origins. Same-origin requests need no ACAO header.
  if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  else if (!origin) headers['Access-Control-Allow-Origin'] = '*';
  return headers;
}

/** Baseline security headers applied to every response. */
export function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  };
}

export function parseJsonSafe<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
}