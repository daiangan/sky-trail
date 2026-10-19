/**
 * "Target altitude" chart for the bottom-right overlay.
 *
 * Shows how high the target climbs above the horizon over the whole imaging
 * night: the full curve, a shaded band for the time actually spent imaging,
 * and a dot that advances with the animation. The window is fixed per
 * session (imaging span plus padding), so the curve stays put while the dot
 * moves along it. Times are UTC, matching the FITS `DATE-OBS` convention.
 *
 * `drawAltitudeChart` draws in logical pixels from the origin and never
 * reads the canvas size, so callers decide the scale (device pixel ratio for
 * the live canvas, the export scale for video frames).
 */

import { computeAltAz } from '../astro/altaz';
import { roundRect, withAlpha } from './canvas_utils';

export const ALTITUDE_CHART_SAMPLES = 96;
export const ALTITUDE_CHART_MIN_HOURS = 8;
export const ALTITUDE_CHART_PADDING_HOURS = 1.5;
export const CHART_WIDTH = 252;
export const CHART_HEIGHT = 140;

const HOUR_MS = 3600 * 1000;
const MAX_ALTITUDE_DEG = 90;
const TICK_STEPS_HOURS = [1, 2, 3, 4, 6, 12];
const MAX_TICKS = 5;

export interface ChartWindow {
  startMs: number;
  endMs: number;
}

export interface AltitudeChartData extends ChartWindow {
  /** Altitude samples evenly spaced across the window, in degrees. */
  altitudes: number[];
  /** First and last imaging timestamps of the session. */
  spanStartMs: number;
  spanEndMs: number;
  /** Time of the frame currently revealed, or null before playback starts. */
  currentMs: number | null;
  /** Session colour, used for the imaging band and the progress curve. */
  color: string;
  /** Session name, shown in the chart title. */
  title: string;
}

/** Imaging span plus padding on both sides, never narrower than the minimum window. */
export function chartWindowForSpan(spanStartMs: number, spanEndMs: number): ChartWindow {
  const pad = ALTITUDE_CHART_PADDING_HOURS * HOUR_MS;
  let startMs = spanStartMs - pad;
  let endMs = spanEndMs + pad;
  const minMs = ALTITUDE_CHART_MIN_HOURS * HOUR_MS;
  if (endMs - startMs < minMs) {
    const mid = (startMs + endMs) / 2;
    startMs = mid - minMs / 2;
    endMs = mid + minMs / 2;
  }
  return { startMs, endMs };
}

export function computeAltitudeSeries(
  observer: { latitudeDeg: number; longitudeDeg: number },
  target: { raDeg: number; decDeg: number },
  window: ChartWindow,
  samples: number = ALTITUDE_CHART_SAMPLES,
): number[] {
  const altitudes: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const at = new Date(window.startMs + t * (window.endMs - window.startMs));
    altitudes.push(computeAltAz(at, observer, target).altitudeDeg);
  }
  return altitudes;
}

/** Linear interpolation of the series at `ms`, or null outside the window. */
export function altitudeAt(data: AltitudeChartData, ms: number): number | null {
  const { altitudes, startMs, endMs } = data;
  if (altitudes.length === 0 || ms < startMs || ms > endMs) return null;
  if (altitudes.length === 1) return altitudes[0]!;
  const position = ((ms - startMs) / (endMs - startMs)) * (altitudes.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, altitudes.length - 1);
  const fraction = position - lower;
  return altitudes[lower]! * (1 - fraction) + altitudes[upper]! * fraction;
}

/** Smallest hour step that keeps the time axis to at most `MAX_TICKS` labels. */
export function chartTickStepHours(windowHours: number): number {
  for (const step of TICK_STEPS_HOURS) {
    if (windowHours / step <= MAX_TICKS) return step;
  }
  return 24;
}

/** UTC-hour-aligned tick timestamps inside the window. */
export function chartTicks(window: ChartWindow): number[] {
  const stepMs = chartTickStepHours((window.endMs - window.startMs) / HOUR_MS) * HOUR_MS;
  const ticks: number[] = [];
  for (let t = Math.ceil(window.startMs / stepMs) * stepMs; t <= window.endMs; t += stepMs) {
    ticks.push(t);
  }
  return ticks;
}

export interface AltitudeChartStyle {
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  dimTextColor?: string;
  gridColor?: string;
  curveColor?: string;
}

const PLOT = { left: 32, right: 12, top: 44, bottom: 24 };

export function drawAltitudeChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: AltitudeChartData | null,
  style: AltitudeChartStyle = {},
): void {
  if (!data) return;
  const backgroundColor = style.backgroundColor ?? 'rgba(8, 10, 18, 0.62)';
  const borderColor = style.borderColor ?? 'rgba(120, 132, 158, 0.35)';
  const textColor = style.textColor ?? 'rgb(226, 231, 244)';
  const dimTextColor = style.dimTextColor ?? 'rgba(170, 178, 198, 0.9)';
  const gridColor = style.gridColor ?? 'rgba(120, 132, 158, 0.28)';
  const curveColor = style.curveColor ?? 'rgba(200, 210, 232, 0.5)';

  const plotW = width - PLOT.left - PLOT.right;
  const plotH = height - PLOT.top - PLOT.bottom;
  const plotBottom = PLOT.top + plotH;
  const spanMs = data.endMs - data.startMs;
  const xOf = (ms: number) => PLOT.left + ((ms - data.startMs) / spanMs) * plotW;
  const yOf = (alt: number) => PLOT.top + (1 - Math.max(0, alt) / MAX_ALTITUDE_DEG) * plotH;
  const sampleMs = (i: number) =>
    data.startMs + (data.altitudes.length === 1 ? 0 : i / (data.altitudes.length - 1)) * spanMs;

  ctx.save();

  ctx.fillStyle = backgroundColor;
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, 8);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header: title on the left, current altitude on the right.
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = dimTextColor;
  ctx.font = "600 10px 'Inter', system-ui, sans-serif";
  ctx.fillText(`ALTITUDE · ${data.title.toUpperCase()}`, 12, 11);
  ctx.font = "9px 'Inter', system-ui, sans-serif";
  ctx.fillText('Shaded = imaging time', 12, 26);

  const currentAlt = data.currentMs === null ? null : altitudeAt(data, data.currentMs);
  ctx.textAlign = 'right';
  ctx.fillStyle = textColor;
  ctx.font = "600 18px 'Outfit', 'Inter', system-ui, sans-serif";
  ctx.fillText(currentAlt === null ? '—' : `${Math.round(currentAlt)}°`, width - 12, 8);

  // Horizontal grid + altitude labels.
  ctx.font = "9px 'Inter', system-ui, sans-serif";
  ctx.textBaseline = 'middle';
  for (const alt of [0, 30, 60, MAX_ALTITUDE_DEG]) {
    const y = yOf(alt);
    ctx.strokeStyle = gridColor;
    ctx.setLineDash(alt === 0 ? [] : [2, 4]);
    ctx.beginPath();
    ctx.moveTo(PLOT.left, y);
    ctx.lineTo(PLOT.left + plotW, y);
    ctx.stroke();
    ctx.fillStyle = dimTextColor;
    ctx.fillText(`${alt}°`, PLOT.left - 6, y);
  }
  ctx.setLineDash([]);

  // Time axis ticks.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const tick of chartTicks(data)) {
    const x = xOf(tick);
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    ctx.moveTo(x, plotBottom);
    ctx.lineTo(x, plotBottom + 3);
    ctx.stroke();
    ctx.fillStyle = dimTextColor;
    ctx.fillText(`${String(new Date(tick).getUTCHours()).padStart(2, '0')}:00`, x, plotBottom + 6);
  }
  ctx.textAlign = 'left';
  ctx.fillText('UTC', 4, plotBottom + 6);

  // Imaging band: the time the session actually spent shooting.
  const bandStart = Math.max(PLOT.left, xOf(data.spanStartMs));
  const bandEnd = Math.min(PLOT.left + plotW, xOf(data.spanEndMs));
  if (bandEnd > bandStart) {
    ctx.fillStyle = withAlpha(data.color, 0.16);
    ctx.fillRect(bandStart, PLOT.top, bandEnd - bandStart, plotH);
    ctx.fillStyle = withAlpha(data.color, 0.9);
    ctx.fillRect(bandStart, plotBottom - 2, bandEnd - bandStart, 2);
  }

  // Whole-night curve, dim; the part already revealed is redrawn on top in colour.
  strokeAltitude(ctx, data, sampleMs, xOf, yOf, Infinity, curveColor, 1.5);
  if (data.currentMs !== null) {
    ctx.shadowColor = data.color;
    ctx.shadowBlur = 6;
    strokeAltitude(ctx, data, sampleMs, xOf, yOf, data.currentMs, data.color, 2.2);
    ctx.shadowBlur = 0;

    if (currentAlt !== null) {
      const x = xOf(data.currentMs);
      ctx.strokeStyle = withAlpha(data.color, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PLOT.top);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = withAlpha(data.color, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, yOf(currentAlt), 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, yOf(currentAlt), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Strokes the altitude curve up to `untilMs`, breaking the line where the
 * target is below the horizon and ending exactly on the horizon crossing.
 */
function strokeAltitude(
  ctx: CanvasRenderingContext2D,
  data: AltitudeChartData,
  sampleMs: (index: number) => number,
  xOf: (ms: number) => number,
  yOf: (alt: number) => number,
  untilMs: number,
  color: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let penDown = false;
  for (let i = 0; i < data.altitudes.length; i += 1) {
    const ms = sampleMs(i);
    if (ms > untilMs) break;
    const alt = data.altitudes[i]!;
    const previous = i > 0 ? data.altitudes[i - 1]! : alt;
    if (alt >= 0) {
      if (!penDown) {
        if (i > 0 && previous < 0) {
          const crossing = previous / (previous - alt);
          ctx.moveTo(xOf(sampleMs(i - 1) + crossing * (ms - sampleMs(i - 1))), yOf(0));
          ctx.lineTo(xOf(ms), yOf(alt));
        } else {
          ctx.moveTo(xOf(ms), yOf(alt));
        }
        penDown = true;
      } else {
        ctx.lineTo(xOf(ms), yOf(alt));
      }
    } else if (penDown) {
      const crossing = previous / (previous - alt);
      ctx.lineTo(xOf(sampleMs(i - 1) + crossing * (ms - sampleMs(i - 1))), yOf(0));
      penDown = false;
    }
  }
  ctx.stroke();
}
