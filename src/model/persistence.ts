/**
 * Persists the project-level fallback coordinates across browser sessions
 * via `localStorage`. Equivalent to the Python project's settings.json at
 * `~/.config/dg_lights_animation/settings.json`.
 *
 * The storage key is versioned (`v1`) so a future schema change can migrate
 * without breaking older browsers. All accessors are tolerant of missing
 * storage (private mode, quota errors, server-side rendering).
 */

const STORAGE_KEY = 'skyTrail.fallbackCoords.v1';

export interface RememberedCoordinates {
  raDeg: number | null;
  decDeg: number | null;
  latDeg: number | null;
  lonDeg: number | null;
}

export function emptyRemembered(): RememberedCoordinates {
  return { raDeg: null, decDeg: null, latDeg: null, lonDeg: null };
}

export function saveFallbackCoords(coords: RememberedCoordinates): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(coords));
  } catch {
    // private browsing, quota exceeded, etc. -- silent no-op
  }
}

export function loadFallbackCoords(): RememberedCoordinates {
  const storage = getStorage();
  if (!storage) return emptyRemembered();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyRemembered();
    return validateRemembered(JSON.parse(raw));
  } catch {
    return emptyRemembered();
  }
}

export function validateRemembered(value: unknown): RememberedCoordinates {
  if (!value || typeof value !== 'object') return emptyRemembered();
  const v = value as Record<string, unknown>;
  return {
    raDeg: numberOrNull(v['raDeg']),
    decDeg: numberOrNull(v['decDeg']),
    latDeg: numberOrNull(v['latDeg']),
    lonDeg: numberOrNull(v['lonDeg']),
  };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getStorage(): Storage | null {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage;
  }
  return null;
}
