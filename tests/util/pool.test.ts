import { describe, expect, it } from 'vitest';
import { isAbortError, mapConcurrent } from '../../src/util/pool';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mapConcurrent', () => {
  it('keeps results in input order even when items finish out of order', async () => {
    const delays = [30, 5, 15, 1];
    const result = await mapConcurrent(delays, 4, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('never runs more than `limit` calls at once, and does use the whole limit', async () => {
    let running = 0;
    let peak = 0;
    await mapConcurrent(Array.from({ length: 20 }), 5, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    expect(peak).toBe(5);
  });

  it('handles an empty list', async () => {
    expect(await mapConcurrent([], 4, async () => 1)).toEqual([]);
  });

  it('reports each finished item with a running count', async () => {
    const counts: number[] = [];
    await mapConcurrent([1, 2, 3], 2, async (n) => n, { onItemDone: (done) => counts.push(done) });
    expect(counts).toEqual([1, 2, 3]);
  });

  it('rejects with the first failure and starts no new work after it', async () => {
    let started = 0;
    await expect(
      mapConcurrent(Array.from({ length: 50 }), 2, async (_, i) => {
        started += 1;
        await tick();
        if (i === 1) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(started).toBeLessThan(10);
  });

  it('stops with an abort error when the signal fires', async () => {
    const controller = new AbortController();
    let started = 0;
    const run = mapConcurrent(
      Array.from({ length: 50 }),
      2,
      async () => {
        started += 1;
        await tick();
        controller.abort();
      },
      { signal: controller.signal },
    );
    const error = await run.catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
    expect(started).toBeLessThan(10);
  });
});
