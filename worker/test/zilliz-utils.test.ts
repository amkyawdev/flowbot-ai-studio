import { describe, expect, it } from 'vitest';
import { normalizeZillizEndpoint, parseCollectionNames } from '../src/integrations/zilliz';

describe('normalizeZillizEndpoint', () => {
  it('adds https and strips trailing slashes', () => {
    expect(normalizeZillizEndpoint(' in03-abc.serverless.aws-eu-central-1.cloud.zilliz.com/ '))
      .toBe('https://in03-abc.serverless.aws-eu-central-1.cloud.zilliz.com');
  });
  it('keeps an explicit scheme', () => {
    expect(normalizeZillizEndpoint('http://localhost:9091/')).toBe('http://localhost:9091');
  });
  it('returns empty for a blank endpoint', () => {
    expect(normalizeZillizEndpoint('  ')).toBe('');
  });
});

describe('parseCollectionNames', () => {
  it('reads camelCase, snake_case and plain strings', () => {
    expect(parseCollectionNames([
      { collectionName: 'a' },
      { collection_name: 'b' },
      'c',
      { name: 'd' },
      null,
    ])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('returns an empty array for non-arrays', () => {
    expect(parseCollectionNames(null)).toEqual([]);
    expect(parseCollectionNames({ collectionName: 'a' })).toEqual([]);
  });
});
