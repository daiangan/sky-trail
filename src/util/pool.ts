/**
 * Small async helpers for reading many files without waiting on each one in
 * turn: a bounded-concurrency map that keeps results in input order, and the
 * abort error used to cancel it.
 */

export function abortError(): Error {
  return new DOMException('The operation was cancelled.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface MapConcurrentOptions {
  signal?: AbortSignal;
  /** Called after each item finishes, with how many are done so far and the item's index. */
  onItemDone?: (done: number, index: number) => void;
}

/**
 * Like `Promise.all(items.map(fn))` but with at most `limit` calls in flight.
 * Results keep the order of `items`. The first failure (or an abort) stops new
 * work from starting and rejects the whole call.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: MapConcurrentOptions = {},
): Promise<R[]> {
  const { signal, onItemDone } = options;
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed) {
      if (signal?.aborted) throw abortError();
      const index = next;
      if (index >= items.length) return;
      next += 1;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
      done += 1;
      onItemDone?.(done, index);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  if (signal?.aborted) throw abortError();
  return results;
}
