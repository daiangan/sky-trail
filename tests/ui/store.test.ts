import { describe, expect, it } from 'vitest';
import { Store } from '../../src/ui/store';

describe('Store', () => {
  it('returns the initial state from get()', () => {
    const store = new Store({ count: 0 });
    expect(store.get()).toEqual({ count: 0 });
  });

  it('notifies listeners when set() updates state', () => {
    const store = new Store({ count: 0 });
    const calls: number[] = [];
    store.subscribe((s) => calls.push(s.count));
    store.set((s) => ({ count: s.count + 1 }));
    store.set((s) => ({ count: s.count + 1 }));
    expect(calls).toEqual([1, 2]);
  });

  it('passes the new state to every listener', () => {
    const store = new Store<string>('a');
    const seen: string[] = [];
    store.subscribe((s) => seen.push(s));
    store.set(() => 'b');
    store.set(() => 'c');
    expect(seen).toEqual(['b', 'c']);
  });

  it('unsubscribe stops further notifications', () => {
    const store = new Store({ count: 0 });
    const calls: number[] = [];
    const unsub = store.subscribe((s) => calls.push(s.count));
    store.set((_s) => ({ count: 1 }));
    unsub();
    store.set((_s) => ({ count: 2 }));
    expect(calls).toEqual([1]);
  });

  it('supports multiple independent subscribers', () => {
    const store = new Store({ count: 0 });
    const a: number[] = [];
    const b: number[] = [];
    store.subscribe((s) => a.push(s.count));
    store.subscribe((s) => b.push(s.count));
    store.set((_s) => ({ count: 1 }));
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it('notifies listeners even when the updater returns a value-equal state (no built-in equality check)', () => {
    const store = new Store({ count: 0 });
    const calls: number[] = [];
    store.subscribe((s) => calls.push(s.count));
    store.set(() => ({ count: 0 }));
    expect(calls).toEqual([0]);
  });
});
