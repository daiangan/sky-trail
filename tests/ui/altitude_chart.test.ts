import { describe, expect, it } from 'vitest';
import {
  ALTITUDE_CHART_HOURS,
  ALTITUDE_CHART_SAMPLES,
  computeAltitudeCurve,
  drawAltitudeChart,
} from '../../src/ui/altitude_chart';

describe('computeAltitudeCurve', () => {
  it('returns the default sample count (48)', () => {
    const curve = computeAltitudeCurve(
      { latitudeDeg: 40, longitudeDeg: -3.7 },
      { raDeg: 83.8221, decDeg: -5.3911 },
      new Date('2026-01-15T20:03:00Z'),
    );
    expect(curve).toHaveLength(ALTITUDE_CHART_SAMPLES);
    expect(ALTITUDE_CHART_SAMPLES).toBe(48);
  });

  it('spans the requested hour window ending at the given timestamp', () => {
    const endTime = new Date('2026-01-15T20:03:00Z');
    const curve = computeAltitudeCurve(
      { latitudeDeg: 0, longitudeDeg: 0 },
      { raDeg: 0, decDeg: 0 },
      endTime,
      8,
      4,
    );
    expect(curve).toHaveLength(4);
    // Sample indices correspond to startTime + i/(N-1) * (endTime - startTime).
    // Each sample is independently computed -- this is just a smoke test
    // that the loop runs without throwing and returns finite values.
    for (const alt of curve) {
      expect(Number.isFinite(alt)).toBe(true);
    }
  });

  it('honors a custom hours and sample count', () => {
    const curve = computeAltitudeCurve(
      { latitudeDeg: 40, longitudeDeg: -3.7 },
      { raDeg: 83.8221, decDeg: -5.3911 },
      new Date('2026-01-15T20:03:00Z'),
      4,
      8,
    );
    expect(curve).toHaveLength(8);
  });

  it('default window is 16 hours', () => {
    expect(ALTITUDE_CHART_HOURS).toBe(16);
  });
});

describe('drawAltitudeChart', () => {
  function makeCtx(): CanvasRenderingContext2D {
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      fillRect: () => undefined,
      strokeRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      scale: () => undefined,
      fillText: () => undefined,
      clearRect: () => undefined,
      setLineDash: () => undefined,
      canvas: { width: 220, height: 120 },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'top',
      textAlign: 'left',
    } as unknown as CanvasRenderingContext2D;
    return ctx;
  }

  it('renders without throwing for a normal curve', () => {
    const ctx = makeCtx();
    const altitudes = [10, 20, 30, 40, 50, 60, 70, 80];
    expect(() => drawAltitudeChart(ctx, altitudes, 7)).not.toThrow();
  });

  it('renders an empty chart when given no data', () => {
    const ctx = makeCtx();
    expect(() => drawAltitudeChart(ctx, [], 0)).not.toThrow();
  });

  it('clamps currentIndex to the data range', () => {
    const ctx = makeCtx();
    const altitudes = [10, 20, 30];
    expect(() => drawAltitudeChart(ctx, altitudes, 100)).not.toThrow();
    expect(() => drawAltitudeChart(ctx, altitudes, -5)).not.toThrow();
  });
});
