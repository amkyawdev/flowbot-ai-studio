import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT, avatarFor, avatarGender, avatarGenderForIndex, avatarIndex } from './avatars';

describe('public chat avatars', () => {
  it('has 30 avatars', () => {
    expect(AVATAR_COUNT).toBe(30);
  });

  it('returns a valid avatar file for any seed', () => {
    for (const seed of ['u_1', 'u_2', 'abc', '', 'Aung Myo Kyaw']) {
      const src = avatarFor(seed);
      expect(src).toMatch(/^\/avatars\/avatar-\d{2}\.svg$/);
      const n = Number(src.match(/avatar-(\d+)/)![1]);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(30);
    }
  });

  it('is deterministic', () => {
    expect(avatarFor('u_123')).toBe(avatarFor('u_123'));
  });

  it('maps indices 0-14 to male and 15-29 to female', () => {
    for (let i = 0; i < 15; i++) expect(avatarGenderForIndex(i)).toBe('male');
    for (let i = 15; i < 30; i++) expect(avatarGenderForIndex(i)).toBe('female');
    expect(avatarGender('u_123')).toMatch(/male|female/);
    expect(avatarIndex('u_123')).toBeGreaterThanOrEqual(0);
    expect(avatarIndex('u_123')).toBeLessThan(30);
  });
});
