import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyRemembered,
  loadFallbackCoords,
  saveFallbackCoords,
  validateRemembered,
} from '../../src/model/persistence';

interface MockStorage {
  store: Map<string, string>;
}

function installLocalStorage(): MockStorage {
  const store = new Map<string, string>();
  const fake: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', fake);
  return { store };
}

describe('validateRemembered', () => {
  it('returns the empty record for non-object input', () => {
    expect(validateRemembered(null)).toEqual(emptyRemembered());
    expect(validateRemembered('oops')).toEqual(emptyRemembered());
    expect(validateRemembered(42)).toEqual(emptyRemembered());
  });

  it('coerces non-numeric fields to null', () => {
    expect(
      validateRemembered({
        raDeg: 83.82,
        decDeg: 'nope',
        latDeg: null,
        lonDeg: 40,
      }),
    ).toEqual({ raDeg: 83.82, decDeg: null, latDeg: null, lonDeg: 40 });
  });

  it('rejects NaN and Infinity', () => {
    expect(validateRemembered({ raDeg: Number.NaN, decDeg: Number.POSITIVE_INFINITY })).toEqual({
      raDeg: null,
      decDeg: null,
      latDeg: null,
      lonDeg: null,
    });
  });
});

describe('saveFallbackCoords / loadFallbackCoords', () => {
  let originalStorage: Storage | undefined;
  beforeEach(() => {
    originalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  });
  afterEach(() => {
    if (originalStorage === undefined) {
      vi.unstubAllGlobals();
    } else {
      vi.stubGlobal('localStorage', originalStorage);
    }
  });

  it('round-trips a stored record', () => {
    installLocalStorage();
    const input = { raDeg: 83.82, decDeg: -5.39, latDeg: 40, lonDeg: -3.7 };
    saveFallbackCoords(input);
    expect(loadFallbackCoords()).toEqual(input);
  });

  it('returns the empty record when nothing has been stored', () => {
    installLocalStorage();
    expect(loadFallbackCoords()).toEqual(emptyRemembered());
  });

  it('returns the empty record when the stored JSON is malformed', () => {
    const { store } = installLocalStorage();
    store.set('skyTrail.fallbackCoords.v1', '{ this is not json');
    expect(loadFallbackCoords()).toEqual(emptyRemembered());
  });

  it('survives a setItem that throws (e.g. quota exceeded)', () => {
    const throwing: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      get length() {
        return 0;
      },
    };
    vi.stubGlobal('localStorage', throwing);
    expect(() => saveFallbackCoords({ raDeg: 1, decDeg: 2, latDeg: 3, lonDeg: 4 })).not.toThrow();
    expect(loadFallbackCoords()).toEqual(emptyRemembered());
  });

  it('returns the empty record when localStorage is unavailable', () => {
    vi.unstubAllGlobals();
    // Force absence of localStorage on globalThis
    const w = globalThis as Record<string, unknown>;
    delete w['localStorage'];
    expect(loadFallbackCoords()).toEqual(emptyRemembered());
  });
});
