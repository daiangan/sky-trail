import { describe, expect, it } from 'vitest';
import {
  ALTITUDE_CHART_MIN_HOURS,
  ALTITUDE_CHART_PADDING_HOURS,
  ALTITUDE_CHART_SAMPLES,
  CHART_HEIGHT,
  CHART_WIDTH,
  altitudeAt,
  chartTickStepHours,
  chartTicks,
  chartWindowForSpan,
  computeAltitudeSeries,
  drawAltitudeChart,
  type AltitudeChartData,
} from '../../src/ui/altitude_chart';

const HOUR = 3600 * 1000;

describe('chartWindowForSpan', () => {
  it('pads a long imaging span on both sides', () => {
    const start = Date.UTC(2026, 0, 15, 20);
    const end = Date.UTC(2026, 0, 16, 6);
    const window = chartWindowForSpan(start, end);
    expect(window.startMs).toBe(start - ALTITUDE_CHART_PADDING_HOURS * HOUR);
    expect(window.endMs).toBe(end + ALTITUDE_CHART_PADDING_HOURS * HOUR);
  });

  it('widens a short span to the minimum window, centred on the span', () => {
    const start = Date.UTC(2026, 0, 15, 20);
    const end = Date.UTC(2026, 0, 15, 21);
    const window = chartWindowForSpan(start, end);
    expect((window.endMs - window.startMs) / HOUR).toBe(ALTITUDE_CHART_MIN_HOURS);
    expect((window.startMs + window.endMs) / 2).toBe((start + end) / 2);
  });
});

describe('computeAltitudeSeries', () => {
  const observer = { latitudeDeg: 40, longitudeDeg: -3.7 };
  const target = { raDeg: 83.8221, decDeg: -5.3911 };
  const window = { startMs: Date.UTC(2026, 0, 15, 14), endMs: Date.UTC(2026, 0, 16, 2) };

  it('returns the default sample count', () => {
    expect(computeAltitudeSeries(observer, target, window)).toHaveLength(ALTITUDE_CHART_SAMPLES);
  });

  it('honors a custom sample count and returns finite values', () => {
    const series = computeAltitudeSeries(observer, target, window, 8);
    expect(series).toHaveLength(8);
    for (const alt of series) expect(Number.isFinite(alt)).toBe(true);
  });

  it('reproduces the reference altitude for M42 at 20:03 UTC from 40N 3.7W', () => {
    const at = Date.UTC(2026, 0, 15, 20, 3);
    const [alt] = computeAltitudeSeries(observer, target, { startMs: at, endMs: at + 1 }, 1);
    expect(alt).toBeGreaterThan(30);
    expect(alt).toBeLessThan(45);
  });
});

function sampleData(overrides: Partial<AltitudeChartData> = {}): AltitudeChartData {
  const startMs = Date.UTC(2026, 0, 15, 18);
  const endMs = Date.UTC(2026, 0, 16, 2);
  return {
    startMs,
    endMs,
    altitudes: [-10, 5, 30, 60, 75, 60, 30, 5, -10],
    spanStartMs: Date.UTC(2026, 0, 15, 20),
    spanEndMs: Date.UTC(2026, 0, 16, 0),
    currentMs: Date.UTC(2026, 0, 15, 22),
    color: '#4fc3f7',
    title: 'Night 1',
    ...overrides,
  };
}

describe('altitudeAt', () => {
  it('returns the sample exactly on a sample time', () => {
    const data = sampleData();
    expect(altitudeAt(data, data.startMs)).toBe(-10);
    expect(altitudeAt(data, data.endMs)).toBe(-10);
  });

  it('interpolates between samples', () => {
    const data = sampleData();
    // Halfway between the 3rd (30) and 4th (60) samples.
    const ms = data.startMs + (2.5 / 8) * (data.endMs - data.startMs);
    expect(altitudeAt(data, ms)).toBeCloseTo(45, 5);
  });

  it('returns null outside the window', () => {
    const data = sampleData();
    expect(altitudeAt(data, data.startMs - 1)).toBeNull();
    expect(altitudeAt(data, data.endMs + 1)).toBeNull();
  });
});

describe('time axis ticks', () => {
  it('picks a step that keeps the axis to at most five labels', () => {
    expect(chartTickStepHours(8)).toBe(2);
    expect(chartTickStepHours(12)).toBe(3);
    expect(chartTickStepHours(16)).toBe(4);
    expect(chartTickStepHours(30)).toBe(6);
    expect(chartTickStepHours(60)).toBe(12);
  });

  it('aligns ticks to whole UTC hours inside the window', () => {
    const window = { startMs: Date.UTC(2026, 0, 15, 17, 30), endMs: Date.UTC(2026, 0, 16, 1, 30) };
    const ticks = chartTicks(window);
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(window.startMs);
      expect(tick).toBeLessThanOrEqual(window.endMs);
      expect(tick % HOUR).toBe(0);
    }
  });
});

describe('drawAltitudeChart', () => {
  function makeCtx() {
    const texts: string[] = [];
    const canvas = { width: CHART_WIDTH * 2, height: CHART_HEIGHT * 2 };
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      fillRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      quadraticCurveTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      setLineDash: () => undefined,
      fillText: (text: string) => texts.push(text),
      canvas,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineJoin: 'miter',
      lineCap: 'butt',
      shadowColor: '',
      shadowBlur: 0,
      font: '',
      textBaseline: 'top',
      textAlign: 'left',
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
  }

  it('renders a normal curve without throwing', () => {
    const { ctx } = makeCtx();
    expect(() => drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, sampleData())).not.toThrow();
  });

  it('draws nothing when there is no data', () => {
    const { ctx, texts } = makeCtx();
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, null);
    expect(texts).toHaveLength(0);
  });

  it('labels the night, the UTC axis and the current altitude', () => {
    const { ctx, texts } = makeCtx();
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, sampleData());
    expect(texts.some((t) => t.includes('NIGHT 1'))).toBe(true);
    expect(texts).toContain('UTC');
    expect(texts).toContain('0°');
    expect(texts).toContain('90°');
    expect(
      texts.some(
        (t) => /^\d+°$/.test(t) && t !== '0°' && t !== '30°' && t !== '60°' && t !== '90°',
      ),
    ).toBe(true);
  });

  it('shows a dash for the current altitude before playback starts', () => {
    const { ctx, texts } = makeCtx();
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, sampleData({ currentMs: null }));
    expect(texts).toContain('—');
  });

  it('does not depend on the canvas pixel size (device pixel ratio safe)', () => {
    const a = makeCtx();
    const b = makeCtx();
    (b.ctx.canvas as unknown as { width: number }).width = 9999;
    drawAltitudeChart(a.ctx, CHART_WIDTH, CHART_HEIGHT, sampleData());
    drawAltitudeChart(b.ctx, CHART_WIDTH, CHART_HEIGHT, sampleData());
    expect(b.texts).toEqual(a.texts);
  });

  it('handles a target that never rises above the horizon', () => {
    const { ctx } = makeCtx();
    const data = sampleData({ altitudes: [-40, -35, -30, -35, -40], currentMs: null });
    expect(() => drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, data)).not.toThrow();
  });
});
