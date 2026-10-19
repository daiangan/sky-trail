import { describe, expect, it } from 'vitest';
import { describeIngest } from '../../src/ui/ingest_feedback';

describe('describeIngest', () => {
  it('confirms what was added and where', () => {
    expect(describeIngest(60, 'Night 2', 60, 0)).toEqual({
      kind: 'success',
      message: 'Added 60 lights to Night 2.',
    });
  });

  it('uses the singular for one light', () => {
    expect(describeIngest(1, 'Night 1', 1, 0).message).toBe('Added 1 light to Night 1.');
  });

  it('omits the session when none is selected', () => {
    expect(describeIngest(3, null, 3, 0).message).toBe('Added 3 lights.');
  });

  it('warns when lights cannot be placed on the dome', () => {
    const summary = describeIngest(10, 'Night 1', 40, 12);
    expect(summary.kind).toBe('warning');
    expect(summary.message).toContain('Added 10 lights to Night 1.');
    expect(summary.message).toContain("12 of 40 can't be placed on the dome");
  });
});
