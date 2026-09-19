/**
 * Overlay manager: counter (top-left), stats panel (below counter),
 * altitude mini-chart (bottom-right), and a master visibility toggle
 * that hides/shows all three. Each panel has its own toggle too --
 * section 3.8 of the migration prompt.
 *
 * Caches the altitude curve by nightIndex so the (comparatively heavy)
 * 48-sample compute only runs when the active session changes, not on
 * every reveal tick (the Python project's optimization, kept for
 * parity even though Canvas2D is much cheaper than matplotlib).
 *
 * `renderTo(ctx, width, height)` mirrors the live DOM overlay onto a
 * 2D canvas at the given size, used by the video exporter to capture
 * the same visual the user sees.
 */

import { buildTimeline, formatDuration, formatGb, type TimelinePoint } from '../model/timeline';
import type { OverlayVisibility } from './session_panel';
import type { Store } from './store';
import type { AppState } from './session_panel';
import { ALTITUDE_CHART_HOURS, computeAltitudeCurve, drawAltitudeChart } from './altitude_chart';
import { parseFitsDate } from '../astro/date_parse';
import { clear, el } from './dom';

const CHART_WIDTH = 220;
const CHART_HEIGHT = 120;
const COUNTER_TOP = 16;
const COUNTER_LEFT = 16;
const COUNTER_HEIGHT = 56;
const COUNTER_FONT = "700 24px 'Outfit', 'Inter', system-ui, sans-serif";
const STATS_TOP = COUNTER_TOP + COUNTER_HEIGHT + 10;
const STATS_LEFT = COUNTER_LEFT;
const STATS_FONT = "12px 'Inter', system-ui, monospace, sans-serif";
const STATS_LABEL_FONT = "600 11px 'Inter', system-ui, sans-serif";
const STATS_LINE_GAP = 20;
const CHART_BOTTOM_OFFSET = 16;
const CHART_RIGHT_OFFSET = 16;

export interface OverlaySnapshot {
  counterText: string;
  statsLines: { label: string; value: string }[];
  chartAltitudes: number[] | null;
  visibility: OverlayVisibility;
}

export function mountOverlay(
  root: HTMLElement,
  store: Store<AppState>,
): { getSnapshot: () => OverlaySnapshot; setVisibility: (state: OverlayVisibility) => void } {
  clear(root);
  root.classList.add('overlay-root');

  const counter = el('div', { class: 'overlay__counter', id: 'overlay-counter' });
  const stats = el('div', { class: 'overlay__stats', id: 'overlay-stats' });
  const chartWrap = el('div', { class: 'overlay__chart-wrap', id: 'overlay-chart-wrap' });
  const chartCanvas = el('canvas', {
    class: 'overlay__chart',
    id: 'overlay-chart',
    width: String(CHART_WIDTH),
    height: String(CHART_HEIGHT),
  }) as HTMLCanvasElement;
  chartCanvas.width = CHART_WIDTH * window.devicePixelRatio;
  chartCanvas.height = CHART_HEIGHT * window.devicePixelRatio;
  chartCanvas.style.width = `${CHART_WIDTH}px`;
  chartCanvas.style.height = `${CHART_HEIGHT}px`;
  chartWrap.appendChild(chartCanvas);
  root.append(counter, stats, chartWrap);

  const ctx = chartCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for altitude chart canvas');
  }
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  let cachedNightIndex: number | null = null;
  let cachedCurve: number[] | null = null;
  let lastTimeline: TimelinePoint[] = [];
  let currentVisibility: OverlayVisibility = store.get().overlay;
  let currentSnapshot: OverlaySnapshot = emptySnapshot(currentVisibility);

  const recompute = (state: AppState) => {
    if (lastTimeline.length === 0 && state.project.sessions.length > 0) {
      lastTimeline = buildTimeline(state.project);
    } else if (state.project.sessions.length === 0) {
      lastTimeline = [];
    }
    if (!arraysMatchTimeline(lastTimeline, state)) {
      lastTimeline = buildTimeline(state.project);
      cachedNightIndex = null;
      cachedCurve = null;
    }

    currentVisibility = state.overlay;
    const snapshot = state.playback;
    const point = lastTimeline[snapshot.revealCount - 1];
    const hasPoint = Boolean(point);
    applyVisibility(state.overlay, hasPoint);

    if (!point) {
      counter.textContent = formatDuration(0);
      stats.replaceChildren();
      drawEmptyChart(ctx);
      currentSnapshot = {
        counterText: formatDuration(0),
        statsLines: [],
        chartAltitudes: null,
        visibility: currentVisibility,
      };
      return;
    }

    counter.textContent = formatDuration(point.cumulativeExptimeS);
    const statsLines = [
      { label: 'Subframes', value: String(point.cumulativeSubframes) },
      { label: 'Data', value: formatGb(point.cumulativeBytes) },
      { label: 'Date', value: (point.light.dateObs ?? '').slice(0, 10) },
      { label: 'Night', value: `${point.nightIndex} of ${point.totalNights}` },
    ];
    stats.replaceChildren(
      ...statsLines.map((line) =>
        el('div', {}, [
          el('span', { class: 'overlay__label' }, [`${line.label}:`]),
          ` ${line.value}`,
        ]),
      ),
    );

    if (cachedNightIndex !== point.nightIndex) {
      cachedNightIndex = point.nightIndex;
      cachedCurve = computeCurveForPoint(point);
    }

    drawChart(ctx, cachedCurve ?? [], ALTITUDE_CHART_HOURS);

    currentSnapshot = {
      counterText: formatDuration(point.cumulativeExptimeS),
      statsLines,
      chartAltitudes: cachedCurve,
      visibility: currentVisibility,
    };
  };

  store.subscribe(recompute);
  recompute(store.get());

  return {
    getSnapshot: () => currentSnapshot,
    setVisibility: (visibility: OverlayVisibility) => {
      currentVisibility = visibility;
      currentSnapshot = { ...currentSnapshot, visibility };
      const point = lastTimeline[store.get().playback.revealCount - 1];
      applyVisibility(visibility, Boolean(point));
    },
  };
}

function emptySnapshot(visibility: OverlayVisibility): OverlaySnapshot {
  return { counterText: formatDuration(0), statsLines: [], chartAltitudes: null, visibility };
}

export function renderOverlayTo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: OverlaySnapshot,
): void {
  ctx.save();
  if (snapshot.visibility.visible && snapshot.visibility.counter) {
    drawCounter(ctx, width, height, snapshot.counterText);
  }
  if (snapshot.visibility.visible && snapshot.visibility.stats) {
    drawStats(ctx, width, height, snapshot.statsLines);
  }
  if (snapshot.visibility.visible && snapshot.visibility.chart) {
    drawChartTo(ctx, width, height, snapshot.chartAltitudes);
  }
  ctx.restore();
}

function drawCounter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void {
  ctx.save();
  const boxW = 180;
  const boxH = COUNTER_HEIGHT;
  ctx.fillStyle = 'rgba(8, 10, 18, 0.65)';
  roundRect(ctx, COUNTER_LEFT, COUNTER_TOP, boxW, boxH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 132, 158, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgb(220, 226, 240)';
  ctx.font = COUNTER_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, COUNTER_LEFT + 14, COUNTER_TOP + boxH / 2 + 1);
  ctx.restore();
  void width;
  void height;
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  _width: number,
  _height: number,
  lines: { label: string; value: string }[],
): void {
  if (lines.length === 0) return;
  ctx.save();
  const boxW = 180;
  const lineH = STATS_LINE_GAP;
  const boxH = lineH * lines.length + 14;
  ctx.fillStyle = 'rgba(8, 10, 18, 0.65)';
  roundRect(ctx, STATS_LEFT, STATS_TOP, boxW, boxH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 132, 158, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i += 1) {
    const y = STATS_TOP + 8 + i * lineH;
    ctx.font = STATS_LABEL_FONT;
    ctx.fillStyle = 'rgba(150, 158, 178, 0.85)';
    ctx.fillText(`${lines[i]!.label.toUpperCase()}:`, STATS_LEFT + 12, y);
    ctx.font = STATS_FONT;
    ctx.fillStyle = 'rgb(220, 226, 240)';
    ctx.fillText(lines[i]!.value, STATS_LEFT + 12 + 75, y);
  }
  ctx.restore();
}

let offscreenChartCanvas: HTMLCanvasElement | null = null;
let offscreenChartCtx: CanvasRenderingContext2D | null = null;

function getOffscreenChart(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!offscreenChartCanvas || !offscreenChartCtx) {
    offscreenChartCanvas = document.createElement('canvas');
    offscreenChartCanvas.width = CHART_WIDTH;
    offscreenChartCanvas.height = CHART_HEIGHT;
    const ctx = offscreenChartCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for offscreen chart');
    offscreenChartCtx = ctx;
  }
  return { canvas: offscreenChartCanvas, ctx: offscreenChartCtx };
}

function drawChartTo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  altitudes: number[] | null,
): void {
  if (altitudes === null || altitudes.length === 0) return;
  const x = width - CHART_WIDTH - CHART_RIGHT_OFFSET;
  const y = height - CHART_HEIGHT - CHART_BOTTOM_OFFSET;
  const { canvas: chartCanvas, ctx: chartCtx } = getOffscreenChart();

  chartCtx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  drawAltitudeChart(chartCtx, altitudes, altitudes.length - 1);
  chartCtx.fillStyle = 'rgba(150, 158, 178, 0.85)';
  chartCtx.font = "11px 'Inter', system-ui, sans-serif";
  chartCtx.textBaseline = 'bottom';
  chartCtx.textAlign = 'right';
  chartCtx.fillText(`${ALTITUDE_CHART_HOURS}h window`, CHART_WIDTH - 10, CHART_HEIGHT - 10);

  ctx.save();
  roundRect(ctx, x, y, CHART_WIDTH, CHART_HEIGHT, 8);
  ctx.clip();
  ctx.drawImage(chartCanvas, x, y, CHART_WIDTH, CHART_HEIGHT);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function applyVisibility(visibility: OverlayVisibility, hasPoint: boolean): void {
  const counter = document.getElementById('overlay-counter');
  const stats = document.getElementById('overlay-stats');
  const chart = document.getElementById('overlay-chart-wrap');
  if (counter) {
    counter.style.display = visibility.visible && visibility.counter ? 'block' : 'none';
  }
  if (stats) {
    stats.style.display = visibility.visible && visibility.stats && hasPoint ? 'flex' : 'none';
  }
  if (chart) {
    chart.style.display = visibility.visible && visibility.chart ? 'block' : 'none';
  }
}

function arraysMatchTimeline(timeline: TimelinePoint[], state: AppState): boolean {
  const sessions = state.project.sessions;
  if (timeline.length === 0) return sessions.length === 0;
  let lights = 0;
  for (const s of sessions) lights += s.lights.length;
  return (
    sessions.length === (timeline[timeline.length - 1]?.totalNights ?? 0) &&
    lights >= timeline.length
  );
}

function computeCurveForPoint(point: TimelinePoint): number[] | null {
  const light = point.light;
  if (
    light.objRaDeg === null ||
    light.objDecDeg === null ||
    light.siteLatDeg === null ||
    light.siteLonDeg === null ||
    !light.dateObs
  ) {
    return null;
  }
  const endTime = parseFitsDate(light.dateObs);
  if (!endTime) return null;
  return computeAltitudeCurve(
    { latitudeDeg: light.siteLatDeg, longitudeDeg: light.siteLonDeg },
    { raDeg: light.objRaDeg, decDeg: light.objDecDeg },
    endTime,
  );
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  altitudes: readonly number[],
  hours: number,
): void {
  if (altitudes.length === 0) {
    drawEmptyChart(ctx);
    return;
  }
  drawAltitudeChart(ctx, altitudes, altitudes.length - 1);
  ctx.save();
  ctx.fillStyle = 'rgba(150, 158, 178, 0.85)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'right';
  ctx.fillText(`${hours}h window`, 210, 110);
  ctx.restore();
}

function drawEmptyChart(ctx: CanvasRenderingContext2D): void {
  drawAltitudeChart(ctx, [0, 0], 0);
  ctx.save();
  ctx.fillStyle = 'rgba(150, 158, 178, 0.85)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('No data yet', 110, 60);
  ctx.restore();
}
