import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESETS, play, prefersReducedMotion, validatePreset } from './animations';

describe('animation preset validation', () => {
  it('accepts every built-in preset', () => {
    for (const preset of Object.values(DEFAULT_PRESETS)) {
      expect(validatePreset(preset)).toEqual([]);
    }
  });

  it('rejects properties outside the allowlist', () => {
    const bad = {
      ...DEFAULT_PRESETS.messageIn,
      keyframes: [{ opacity: 0 }, { position: 'absolute' }],
    };
    expect(validatePreset(bad).join(' ')).toMatch(/not allowed/);
  });

  it('rejects script-like values', () => {
    const bad = {
      ...DEFAULT_PRESETS.messageIn,
      keyframes: [{ opacity: 0 }, { transform: 'url(javascript:alert(1))' }],
    };
    expect(validatePreset(bad).length).toBeGreaterThan(0);
  });

  it('rejects eval/Function in easing', () => {
    expect(validatePreset({ ...DEFAULT_PRESETS.messageIn, easing: 'eval(1)' }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...DEFAULT_PRESETS.messageIn, easing: 'Function("x")' }).length).toBeGreaterThan(0);
  });

  it('rejects invalid duration and keyframe counts', () => {
    expect(validatePreset({ ...DEFAULT_PRESETS.messageIn, duration: -1 }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...DEFAULT_PRESETS.messageIn, duration: 99999 }).length).toBeGreaterThan(0);
    expect(validatePreset({ ...DEFAULT_PRESETS.messageIn, keyframes: [{ opacity: 1 }] }).length).toBeGreaterThan(0);
  });
});

describe('reduced motion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('detects the reduced-motion preference', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('skips animation when reduced motion is requested', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
    const animate = vi.fn();
    play({ animate } as unknown as Element, DEFAULT_PRESETS.messageIn);
    expect(animate).not.toHaveBeenCalled();
  });

  it('plays animation when motion is allowed', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    });
    const animate = vi.fn();
    play({ animate } as unknown as Element, DEFAULT_PRESETS.messageIn);
    expect(animate).toHaveBeenCalledTimes(1);
  });
});
