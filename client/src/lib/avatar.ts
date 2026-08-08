/** Deterministic display helpers for turning an email/name string into a stable avatar. */

const AVATAR_PALETTE = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-blue-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-fuchsia-500',
] as const;

/** "Jane Doe <jane@x.com>" -> "Jane Doe", "jane@x.com" -> "jane@x.com" */
export function displayName(participant: string): string {
  const match = /^([^<]+)</.exec(participant);
  return match?.[1] ? match[1].trim() : participant.trim();
}

export function initialsFor(participant: string): string {
  const name = displayName(participant);
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const second = parts[1] as string;
  return (first.charAt(0) + second.charAt(0)).toUpperCase();
}

/** Stable per-string color so the same sender always gets the same avatar color. */
export function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] as string;
}
