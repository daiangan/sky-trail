/**
 * "Altitude, last 16 hours" mini-chart for the bottom-right overlay.
 * 48 uniform samples between (current frame's date - 16h) and
 * (current frame's date), using the active light's resolved
 * coordinates; a white dot marks the current sample.
 *
 * `computeAltitudeCurve` is the heavy part -- the Canvas2D draw helper
 * is cheap, which is why the controller (overlay manager) caches the
 * curve and only recomputes when the active night changes (per the
 * Python project's optimization, kept for parity even though Canvas2D
 * is much cheaper than matplotlib).
 */

import { computeAltAz } from '../astro/altaz';

export const ALTITUDE_CHART_SAMPLES = 48;
export const ALTITUDE_CHART_HOURS = 16;

export function computeAltitudeCurve(
  observer: { latitudeDeg: number; longitudeDeg: number },
  target: { raDeg: number; decDeg: number },
  endTime: Date,
  hours: number = ALTITUDE_CHART_HOURS,
  samples: number = ALTITUDE_CHART_SAMPLES,
): number[] {
  const startTime = new Date(endTime.getTime() - hours * 3600 * 1000);
  const totalMs = endTime.getTime() - startTime.getTime();
  const altitudes: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const at = new Date(startTime.getTime() + t * totalMs);
    const result = computeAltAz(at, observer, target);
    altitudes.push(result.altitudeDeg);
  }
  return altitudes;
}

export interface AltitudeChartStyle {
  backgroundColor?: string;
  axisColor?: string;
  horizonColor?: string;
  curveColor?: string;
  currentColor?: string;
  labelColor?: string;
  padding?: number;
  font?: string;
}

export function drawAltitudeChart(
  ctx: CanvasRenderingContext2D,
  altitudes: readonly number[],
  currentIndex: number,
  style: AltitudeChartStyle = {},
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const padding = style.padding ?? 10;
  const backgroundColor = style.backgroundColor ?? 'rgba(8, 10, 18, 0.78)';
  const axisColor = style.axisColor ?? 'rgba(150, 158, 178, 0.35)';
  const horizonColor = style.horizonColor ?? 'rgba(150, 158, 178, 0.55)';
  const curveColor = style.curveColor ?? 'rgb(220, 226, 240)';
  const currentColor = style.currentColor ?? 'rgb(255, 255, 255)';
  const labelColor = style.labelColor ?? 'rgba(150, 158, 178, 0.85)';
  const font = style.font ?? '11px system-ui, sans-serif';

  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const midY = padding + innerH / 2;

  // Map altDeg -> y: alt=-90 -> bottom (padding+innerH); alt=+90 -> top (padding)
  const altToY = (alt: number) => padding + ((90 - alt) / 180) * innerH;

  // Grid lines: 60 deg, 30 deg, and horizon (0 deg)
  const gridColor = 'rgba(120, 132, 158, 0.22)';
  const gridAltitudes = [60, 30];
  ctx.save();
  ctx.font = '9px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(150, 158, 178, 0.55)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (const gAlt of gridAltitudes) {
    const gy = altToY(gAlt);
    ctx.strokeStyle = gridColor;
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([2, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(padding, gy);
    ctx.lineTo(padding + innerW, gy);
    ctx.stroke();
    ctx.fillText(`${gAlt}°`, padding + 2, gy - 6);
  }
  ctx.restore();

  // Horizon (alt = 0) line
  ctx.strokeStyle = horizonColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, midY);
  ctx.lineTo(padding + innerW, midY);
  ctx.stroke();

  if (altitudes.length > 1) {
    ctx.strokeStyle = curveColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < altitudes.length; i += 1) {
      const x = padding + (i / (altitudes.length - 1)) * innerW;
      const y = altToY(altitudes[i]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Current position marker
  const curIdx = Math.max(0, Math.min(currentIndex, altitudes.length - 1));
  if (altitudes[curIdx] !== undefined) {
    const x =
      padding + (altitudes.length > 1 ? (curIdx / (altitudes.length - 1)) * innerW : innerW / 2);
    const y = altToY(altitudes[curIdx]!);
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = labelColor;
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillText('Altitude (16h)', padding, padding);
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  ctx.fillText(`${altitudes[curIdx]?.toFixed(0) ?? '—'}°`, width - padding, height - padding);
  ctx.textAlign = 'left';

  ctx.restore();
}
