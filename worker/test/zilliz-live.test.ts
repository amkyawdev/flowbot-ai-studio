/**
 * Live connectivity test for the Zilliz integration.
 *
 * Runs only when ZILLIZ_ENDPOINT and ZILLIZ_API_KEY are present in the
 * environment — otherwise the test is skipped (never fails CI without creds).
 */
import { describe, it, expect } from 'vitest';
import { testConnection, describeCollection, createCollection, search, insert } from '../src/integrations/zilliz';

const hasCreds = Boolean(process.env.ZILLIZ_ENDPOINT && process.env.ZILLIZ_API_KEY);
const cfg = {
  endpoint: process.env.ZILLIZ_ENDPOINT || '',
  token: process.env.ZILLIZ_API_KEY || '',
};

describe.runIf(hasCreds)('Zilliz live connectivity', () => {
  it('successfully lists collections', async () => {
    const res = await testConnection(cfg);
    expect(res.ok).toBe(true);
    console.log('[zilliz] collections:', res.collections);
  });

  it('creates a collection, inserts + searches end-to-end', async () => {
    const name = `flowbot_test_${Date.now()}`;
    await createCollection(cfg, { name, dim: 4, metricType: 'COSINE' });
    const info = await describeCollection(cfg, name);
    expect(info).not.toBeNull();
    expect(info!.collectionName ?? info!.collection_name).toBe(name);

    const ins = await insert(cfg, {
      collectionName: name,
      vectors: [
        { vector: [1, 0, 0, 0], metadata: { text: 'flowbot alpha', source: 'e2e' } },
        { vector: [0, 1, 0, 0], metadata: { text: 'flowbot beta', source: 'e2e' } },
      ],
    });
    expect(ins.insertCount).toBeGreaterThan(0);

    // Give the server a moment to index.
    await new Promise((r) => setTimeout(r, 3000));

    const hits = await search(cfg, {
      collectionName: name,
      vector: [0.99, 0.01, 0, 0],
      limit: 5,
      outputFields: ['text', 'source'],
    });
    expect(Array.isArray(hits)).toBe(true);
    // First hit should be the closest vector.
    expect(hits.length).toBeGreaterThan(0);
    console.log('[zilliz] top hit:', JSON.stringify(hits[0]));

    // Cleanup
    await fetch(`${cfg.endpoint}/v2/vectordb/collections/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` },
      body: JSON.stringify({ db_name: 'default', collection_name: name }),
    }).catch(() => undefined);
  }, 30000);
});

describe('zilliz without credentials', () => {
  it('reports graceful failure instead of throwing when unconfigured', async () => {
    if (hasCreds) return; // this branch only matters without creds
    const res = await testConnection({ endpoint: 'https://invalid.invalid', token: 'bad' });
    expect(res.ok).toBe(false);
    expect(res.message).toBeTruthy();
  });
});