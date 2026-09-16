/**
 * Tiny reactive store. Components subscribe; the store calls them on
 * every state update. Updates are immutable: an updater receives the
 * current state and returns a new one, so structural sharing makes
 * "did anything change?" checks cheap.
 */

export type Updater<T> = (state: T) => T;
export type Listener<T> = (state: T) => void;

export class Store<T> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(updater: Updater<T>): void {
    this.state = updater(this.state);
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
