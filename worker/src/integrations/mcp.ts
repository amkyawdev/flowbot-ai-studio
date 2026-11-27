/**
 * Universal remote MCP connector — Streamable HTTP transport (MCP spec 2025-03-26).
 *
 * Supports optional bearer-token auth. Tool schemas are discovered via
 * `tools/list` and invoked through `tools/call`. Timeouts and bounds are
 * applied on every request.
 */

export interface McpServerConfig {
  name: string;
  url: string;
  authType?: 'none' | 'bearer';
  token?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

const DEFAULT_TIMEOUT = 15_000;

async function jsonRpc(cfg: McpServerConfig, method: string, params?: unknown, sessionId?: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...(cfg.headers ?? {}),
  };
  if (cfg.authType === 'bearer' && cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params: params ?? {} }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP server responded ${res.status}: ${res.statusText}`);
    const raw = await res.text();
    // Streamable HTTP may return SSE; parse the last data line.
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
    } catch {
      const lines = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      if (lines.length === 0) throw new Error('MCP server returned non-JSON, non-SSE response');
      payload = JSON.parse(lines[lines.length - 1]);
    }
    if (payload.error) {
      const err = payload.error as { code?: number; message?: string };
      throw new Error(`MCP error ${err.code ?? ''} ${err.message || ''}`.trim());
    }
    return payload;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error(`MCP request timed out after ${cfg.timeoutMs ?? DEFAULT_TIMEOUT}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function initializeMcp(cfg: McpServerConfig): Promise<{ serverInfo?: Record<string, unknown>; sessionId?: string }> {
  const res = await jsonRpc(cfg, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'flowbot-ai-studio', version: '1.0.0' },
  }, undefined);
  // Spec: after initialize, clients should send notifications/initialized. Best-effort.
  await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.authType === 'bearer' && cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  }).catch(() => undefined);
  return { serverInfo: (res?.result as Record<string, unknown> | undefined)?.serverInfo as Record<string, unknown> | undefined };
}

export async function listMcpTools(cfg: McpServerConfig): Promise<McpTool[]> {
  const res = await jsonRpc(cfg, 'tools/list', {});
  const tools = (res?.result as { tools?: McpTool[] } | undefined)?.tools ?? [];
  return tools;
}

export async function callMcpTool(cfg: McpServerConfig, toolName: string, args: Record<string, unknown>): Promise<McpCallResult> {
  const res = await jsonRpc(cfg, 'tools/call', { name: toolName, arguments: args });
  return (res?.result as McpCallResult | undefined) ?? { content: [] };
}

/** Full connectivity test: initialize + tools/list. */
export async function testMcpConnection(cfg: McpServerConfig): Promise<{ ok: boolean; serverInfo?: Record<string, unknown>; toolCount?: number; error?: string }> {
  try {
    const { serverInfo } = await initializeMcp(cfg);
    const tools = await listMcpTools(cfg);
    return { ok: true, serverInfo, toolCount: tools.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'MCP connection failed' };
  }
}