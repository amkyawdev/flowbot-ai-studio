/**
 * Zilliz Cloud (Milvus) vector store client.
 *
 * The endpoint is a configurable environment value; the API token must only
 * ever be provided as a Cloudflare Worker secret (never committed). All
 * requests are authenticated server-side in the Worker and never forwarded
 * to the browser.
 */

export type ZillizVector = number[];

export interface ZillizConfig {
  endpoint: string;
  token: string;
  collection?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 15_000;

/** Normalize a Zilliz endpoint: trim, add https://, strip trailing slashes. */
export function normalizeZillizEndpoint(endpoint: string): string {
  const trimmed = String(endpoint || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

/** Extract collection names from Zilliz list responses (camelCase or snake_case). */
export function parseCollectionNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const o = item as { collectionName?: string; collection_name?: string; name?: string };
        return o.collectionName ?? o.collection_name ?? o.name ?? '';
      }
      return '';
    })
    .filter(Boolean);
}

async function rpc<T>(cfg: ZillizConfig, path: string, payload: Record<string, unknown>): Promise<T> {
  const base = normalizeZillizEndpoint(cfg.endpoint);
  if (!base) throw new Error('Zilliz endpoint is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT);
  try {
    const url = `${base}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { code?: number; message?: string; error?: string; data?: unknown }
      | null;
    if (data?.code !== undefined && data.code !== 0) {
      throw new Error(`Zilliz error (${data.code}): ${data.message || data.error || 'unknown'}`);
    }
    if (!res.ok) {
      throw new Error(`Zilliz HTTP ${res.status}: ${data?.message || res.statusText}`);
    }
    return (data?.data ?? data) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`Zilliz request timed out after ${cfg.timeoutMs ?? DEFAULT_TIMEOUT}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface ZillizCollectionInfo {
  collectionName?: string;
  collection_name?: string;
  fields?: unknown[];
  schema?: unknown;
  rowCount?: number;
  row_count?: number;
}

/** Health/connectivity check: list collections (lightweight, no auth leakage). */
export async function testConnection(cfg: ZillizConfig): Promise<{ ok: boolean; collections?: string[]; message?: string }> {
  try {
    const list = await rpc<unknown[]>(cfg, '/v2/vectordb/collections/list', { dbName: 'default' });
    const names = parseCollectionNames(list);
    return { ok: true, collections: names };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unknown Zilliz error' };
  }
}

export async function createCollection(
  cfg: ZillizConfig,
  opts: { name: string; dim?: number; metricType?: 'IP' | 'COSINE' | 'L2' },
): Promise<void> {
  const dim = opts.dim ?? 1536;
  await rpc(cfg, '/v2/vectordb/collections/create', {
    dbName: 'default',
    collectionName: opts.name,
    dimension: dim,
    metricType: opts.metricType ?? 'IP',
    autoId: true,
  });
}

export interface ZillizHit {
  id?: string | number;
  distance?: number;
  entity?: Record<string, unknown>;
}

export async function search(
  cfg: ZillizConfig,
  req: {
    collectionName: string;
    vector: ZillizVector;
    limit?: number;
    outputFields?: string[];
    filter?: string;
  },
): Promise<ZillizHit[]> {
  const { outputFields = [], limit = 5 } = req;
  const result = await rpc<Array<Record<string, unknown>>>(
    cfg,
    '/v2/vectordb/entities/search',
    {
      dbName: 'default',
      collectionName: req.collectionName,
      data: [req.vector],
      limit,
      outputFields,
      filter: req.filter || undefined,
    },
  );
  // Zilliz REST returns flat hit objects (id, distance + selected output fields).
  const grouped = Array.isArray(result) ? result : [];
  // On multi-query responses Zilliz may nest [ [hit, hit], ... ].
  let flat: Array<Record<string, unknown>> = grouped;
  if (grouped.length === 1 && Array.isArray(grouped[0])) flat = grouped[0] as Array<Record<string, unknown>>;
  return flat.filter(Boolean).map((h) => {
    const { id, distance, ...entity } = h;
    return { id: (id as string | number | undefined), distance: (distance as number | undefined), entity };
  });
}

export async function insert(
  cfg: ZillizConfig,
  req: {
    collectionName: string;
    vectors: Array<{ vector: ZillizVector; metadata?: Record<string, unknown> }>;
  },
): Promise<{ insertCount: number; ids: Array<string | number> }> {
  const rows = req.vectors.map((v) => {
    const entity: Record<string, unknown> = { vector: v.vector };
    if (v.metadata) {
      for (const [k, val] of Object.entries(v.metadata)) {
        // The `vector` field is reserved; prefix other metadata keys.
        if (k !== 'vector') entity[k] = val;
      }
    }
    return entity;
  });
  const result = await rpc<{ insertCount?: number; insertIds?: Array<string | number> }>(cfg, '/v2/vectordb/entities/insert', {
    dbName: 'default',
    collectionName: req.collectionName,
    data: rows,
  });
  return { insertCount: result?.insertCount ?? 0, ids: result?.insertIds ?? [] };
}

export async function describeCollection(cfg: ZillizConfig, name: string): Promise<ZillizCollectionInfo | null> {
  try {
    const info = await rpc<ZillizCollectionInfo>(cfg, '/v2/vectordb/collections/describe', {
      dbName: 'default',
      collectionName: name,
    });
    return info;
  } catch {
    return null;
  }
}

/** Embed text (client-supplied for OpenAI-compatible; defaults to a simple dim placeholder for tests). */
export function embedDummy(text: string, dim = 1536): ZillizVector {
  // Not semantically meaningful — replace with a real embedding provider.
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dim] += text.charCodeAt(i) / Math.max(255, text.length);
  }
  return vec;
}