export const EPOCH_LABELS: Record<string, string> = {
  'E': 'Empathy',
  'P': 'Presence',
  'O': 'Opinion',
  'C': 'Creativity',
  'H': 'Hope',
};

export const EPOCH_COLORS_TW: Record<string, string> = {
  'E': 'bg-red-100 text-red-700 border-red-200',
  'P': 'bg-orange-100 text-orange-700 border-orange-200',
  'O': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'C': 'bg-purple-100 text-purple-700 border-purple-200',
  'H': 'bg-blue-100 text-blue-700 border-blue-200',
};

export const EPOCH_COLORS_INLINE: Record<string, string> = {
  'E': 'background:#fef2f2;color:#b91c1c;border-color:#fecaca',
  'P': 'background:#fff7ed;color:#c2410c;border-color:#fed7aa',
  'O': 'background:#fefce8;color:#a16207;border-color:#fef08a',
  'C': 'background:#faf5ff;color:#7e22ce;border-color:#e9d5ff',
  'H': 'background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe',
};

const VALID_KEYS = new Set(['E', 'P', 'O', 'C', 'H']);

export function parseEpochFlags(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => VALID_KEYS.has(k.toUpperCase()) && v === true)
      .map(([k]) => k.toUpperCase());
  }

  const str = String(value).trim();
  if (!str || str === '[object Object]') return [];

  if (str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);
      return Object.entries(parsed)
        .filter(([k, v]) => VALID_KEYS.has(k.toUpperCase()) && v === true)
        .map(([k]) => k.toUpperCase());
    } catch { /* fall through */ }
  }

  return str
    .split(',')
    .map(f => f.trim().charAt(0).toUpperCase())
    .filter(f => VALID_KEYS.has(f));
}

export function getEpochBadge(flag: string): { color: string; label: string } {
  return {
    color: EPOCH_COLORS_TW[flag] || 'bg-gray-100 text-gray-700',
    label: EPOCH_LABELS[flag] || flag,
  };
}
