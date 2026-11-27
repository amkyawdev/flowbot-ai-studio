/** Generic outbound HTTP client used by the HTTP Request node. */

export interface HttpRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export async function httpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (headers['Content-Type'] === undefined) {
        headers['Content-Type'] = 'application/json';
      }
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { outHeaders[k] = v; });
    return { status: res.status, body: parsed, headers: outHeaders };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`HTTP request timed out after ${opts.timeoutMs ?? 30_000}ms`);
    }
    throw new Error(`HTTP request failed: ${e instanceof Error ? e.message : 'unknown'}`);
  } finally {
    clearTimeout(timer);
  }
}