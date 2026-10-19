/**
 * Where the movable overlays (the counter-and-stats panel and the altitude
 * chart) sit over the dome.
 *
 * A moved overlay is stored as the fraction of the canvas where its top-left
 * corner sits. A fraction survives window resizes, and unlike one measured
 * from the free space it does not shift when the overlay itself changes size
 * (the panel grows when the stats appear). The live DOM and the exported video
 * resolve positions with the same functions, so what you arrange is what you
 * export. An overlay with no stored position sits at its default corner.
 */

export type OverlayId = 'hud' | 'chart';

export interface OverlayPosition {
  /** Left edge as a fraction of the canvas width (0 to 1). */
  x: number;
  /** Top edge as a fraction of the canvas height (0 to 1). */
  y: number;
}

export type OverlayPositions = Partial<Record<OverlayId, OverlayPosition>>;

export interface Size {
  width: number;
  height: number;
}

export interface Origin {
  left: number;
  top: number;
}

/** Distance of an overlay from the edges of the canvas in its default spot. */
export const DEFAULT_MARGIN = 16;

const OVERLAY_IDS: readonly OverlayId[] = ['hud', 'chart'];
const STORAGE_KEY = 'skyTrail.overlayPositions.v1';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The built-in spot: the panel top-left, the chart bottom-right. */
export function defaultOrigin(id: OverlayId, canvas: Size, box: Size): Origin {
  if (id === 'hud') return { left: DEFAULT_MARGIN, top: DEFAULT_MARGIN };
  return {
    left: canvas.width - box.width - DEFAULT_MARGIN,
    top: canvas.height - box.height - DEFAULT_MARGIN,
  };
}

/** Keeps an overlay inside the canvas; one larger than the canvas pins to its top-left. */
export function clampOrigin(origin: Origin, canvas: Size, box: Size): Origin {
  return {
    left: clamp(origin.left, 0, Math.max(0, canvas.width - box.width)),
    top: clamp(origin.top, 0, Math.max(0, canvas.height - box.height)),
  };
}

/** Pixel position of an overlay: its stored spot if the user moved it, otherwise the default. */
export function originFor(
  id: OverlayId,
  positions: OverlayPositions,
  canvas: Size,
  box: Size,
): Origin {
  const stored = positions[id];
  if (!stored) return defaultOrigin(id, canvas, box);
  return clampOrigin({ left: stored.x * canvas.width, top: stored.y * canvas.height }, canvas, box);
}

/** The position to store once the user has dropped an overlay at `origin`. */
export function positionFromOrigin(origin: Origin, canvas: Size, box: Size): OverlayPosition {
  const inside = clampOrigin(origin, canvas, box);
  return {
    x: canvas.width > 0 ? inside.left / canvas.width : 0,
    y: canvas.height > 0 ? inside.top / canvas.height : 0,
  };
}

export function hasCustomPositions(positions: OverlayPositions): boolean {
  return OVERLAY_IDS.some((id) => positions[id] !== undefined);
}

/** Accepts only well-formed positions from storage; anything else is ignored. */
export function validatePositions(value: unknown): OverlayPositions {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: OverlayPositions = {};
  for (const id of OVERLAY_IDS) {
    const entry = record[id];
    if (!entry || typeof entry !== 'object') continue;
    const { x, y } = entry as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    result[id] = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }
  return result;
}

function getStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

export function loadOverlayPositions(): OverlayPositions {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? validatePositions(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveOverlayPositions(positions: OverlayPositions): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (hasCustomPositions(positions)) storage.setItem(STORAGE_KEY, JSON.stringify(positions));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // private browsing, quota exceeded, etc. -- the positions just won't persist
  }
}
