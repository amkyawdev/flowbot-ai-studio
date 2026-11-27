import { describe, it, expect } from 'vitest';
import { zillizConfigFromEnv } from '../src/engine/executors';

function makeEnv(overrides: Record<string, string> = {}) {
  return {
    ZILLIZ_ENDPOINT: overrides.ZILLIZ_ENDPOINT ?? 'https://example-serverless.cloud.zilliz.com',
    ZILLIZ_API_KEY: overrides.ZILLIZ_API_KEY ?? 'test-api-key-not-a-real-secret',
    ZILLIZ_COLLECTION: overrides.ZILLIZ_COLLECTION ?? undefined,
  };
}

describe('zillizConfigFromEnv', () => {
  it('throws a clear error when ZILLIZ_API_KEY is missing', () => {
    expect(() => zillizConfigFromEnv(makeEnv({ ZILLIZ_API_KEY: '' }))).toThrow(/ZILLIZ_ENDPOINT and ZILLIZ_API_KEY/);
  });

  it('throws a clear error when ZILLIZ_ENDPOINT is missing', () => {
    expect(() => zillizConfigFromEnv(makeEnv({ ZILLIZ_ENDPOINT: '' }))).toThrow(/ZILLIZ_ENDPOINT and ZILLIZ_API_KEY/);
  });

  it('returns the endpoint token pair when configured', () => {
    const { zcfg } = zillizConfigFromEnv(makeEnv());
    expect(zcfg.endpoint).toContain('zilliz.com');
    expect(zcfg.token).toBe('test-api-key-not-a-real-secret');
  });

  it('defaults the collection when not set', () => {
    const { collection } = zillizConfigFromEnv(makeEnv());
    expect(collection).toBe('flowbot_chunks');
  });

  it('honors an explicit ZILLIZ_COLLECTION', () => {
    const { collection } = zillizConfigFromEnv(makeEnv({ ZILLIZ_COLLECTION: 'my_kb' }));
    expect(collection).toBe('my_kb');
  });

  it('trims whitespace from env values', () => {
    const { zcfg } = zillizConfigFromEnv(makeEnv({ ZILLIZ_ENDPOINT: '  https://x.zilliz.com  ', ZILLIZ_API_KEY: '  key  ' }));
    expect(zcfg.endpoint).toBe('https://x.zilliz.com');
    expect(zcfg.token).toBe('key');
  });
});