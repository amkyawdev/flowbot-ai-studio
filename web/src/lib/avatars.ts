export const AVATAR_COUNT = 30;

/** Deterministic FNV-1a index in [0, 30). */
export function avatarIndex(seed: string): number {
  const s = seed || 'user';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % AVATAR_COUNT;
}

/** 15 male avatars (01–15) followed by 15 female avatars (16–30). */
export function avatarFor(seed: string): string {
  return `/avatars/avatar-${String(avatarIndex(seed) + 1).padStart(2, '0')}.svg`;
}

export function avatarGenderForIndex(index: number): 'male' | 'female' {
  return index < 15 ? 'male' : 'female';
}

export function avatarGender(seed: string): 'male' | 'female' {
  return avatarGenderForIndex(avatarIndex(seed));
}
