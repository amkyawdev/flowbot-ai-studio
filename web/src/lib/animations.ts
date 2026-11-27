/**
 * Small, safe animation controller for the chat experience.
 * Presets are plain data (no code). Nothing here evaluates strings.
 */

export interface AnimationPreset {
  id: string;
  name: string;
  duration: number;
  easing: string;
  keyframes: Keyframe[];
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export const DEFAULT_PRESETS: Record<string, AnimationPreset> = {
  messageIn: {
    id: 'messageIn',
    name: 'Message entrance',
    duration: 180,
    easing: EASE,
    keyframes: [
      { opacity: 0, transform: 'translateY(6px) scale(0.99)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
  },
  panelIn: {
    id: 'panelIn',
    name: 'Panel transition',
    duration: 200,
    easing: EASE,
    keyframes: [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
  sidebarIn: {
    id: 'sidebarIn',
    name: 'Sidebar slide',
    duration: 220,
    easing: EASE,
    keyframes: [
      { opacity: 0, transform: 'translateX(-12px)' },
      { opacity: 1, transform: 'translateX(0)' },
    ],
  },
  typing: {
    id: 'typing',
    name: 'Typing indicator',
    duration: 900,
    easing: 'ease-in-out',
    keyframes: [
      { opacity: 0.35, transform: 'translateY(0)' },
      { opacity: 1, transform: 'translateY(-2px)' },
      { opacity: 0.35, transform: 'translateY(0)' },
    ],
  },
  presence: {
    id: 'presence',
    name: 'Active users marquee',
    duration: 22000,
    easing: 'linear',
    keyframes: [
      { transform: 'translateX(-50%)' },
      { transform: 'translateX(0%)' },
    ],
  },
};

const ALLOWED_PROPS = new Set(['opacity', 'transform', 'filter', 'background-color', 'box-shadow']);
const FORBIDDEN = /(url\s*\(|javascript:|<script|eval\s*\(|Function\s*\(|expression\s*\()/i;

/** Validate an untrusted preset object. Returns a list of problems (empty = valid). */
export function validatePreset(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Preset must be an object'];
  const p = input as Partial<AnimationPreset>;
  if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(p.id)) errors.push('id must be 1–40 letters, digits, _ or -');
  if (typeof p.name !== 'string' || p.name.length > 60) errors.push('name must be a string (max 60 chars)');
  if (typeof p.duration !== 'number' || !Number.isFinite(p.duration) || p.duration < 0 || p.duration > 60000) {
    errors.push('duration must be 0–60000ms');
  }
  if (typeof p.easing !== 'string' || p.easing.length > 60 || FORBIDDEN.test(p.easing)) {
    errors.push('easing must be a short CSS easing value');
  }
  if (!Array.isArray(p.keyframes) || p.keyframes.length < 2 || p.keyframes.length > 10) {
    errors.push('keyframes must contain 2–10 steps');
  } else {
    for (const [i, frame] of p.keyframes.entries()) {
      if (!frame || typeof frame !== 'object') { errors.push(`keyframe ${i} must be an object`); continue; }
      for (const [prop, value] of Object.entries(frame as Record<string, unknown>)) {
        if (!ALLOWED_PROPS.has(prop)) errors.push(`keyframe ${i}: "${prop}" is not allowed`);
        if (typeof value !== 'string' && typeof value !== 'number') errors.push(`keyframe ${i}: "${prop}" must be a string or number`);
        if (typeof value === 'string' && FORBIDDEN.test(value)) errors.push(`keyframe ${i}: "${prop}" contains a disallowed value`);
      }
    }
  }
  return errors;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Play a preset on an element. Respects reduced-motion and never throws. */
export function play(el: Element | null | undefined, preset: AnimationPreset | string): void {
  if (!el || prefersReducedMotion()) return;
  const p = typeof preset === 'string' ? DEFAULT_PRESETS[preset] : preset;
  if (!p) return;
  const animate = (el as Element & { animate?: (k: Keyframe[], o: KeyframeAnimationOptions) => Animation }).animate;
  if (typeof animate !== 'function') return;
  try {
    animate.call(el, p.keyframes, { duration: p.duration, easing: p.easing, fill: 'both' });
  } catch {
    /* animation is best-effort */
  }
}

const CUSTOM_KEY = 'flowbot_animation_presets';

export function loadCustomPresets(): Record<string, AnimationPreset> {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, AnimationPreset> = {};
    for (const [id, preset] of Object.entries(parsed)) {
      if (validatePreset(preset).length === 0) out[id] = preset as AnimationPreset;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCustomPresets(presets: Record<string, AnimationPreset>): void {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(presets)); } catch { /* ignore quota */ }
}
