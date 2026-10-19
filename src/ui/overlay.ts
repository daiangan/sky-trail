/**
 * Overlay manager: counter (top-left), stats panel (below counter),
 * altitude chart (bottom-right), and a master visibility toggle that
 * hides/shows all three. Each panel has its own toggle too -- section 3.8
 * of the migration prompt.
 *
 * The altitude chart data (the night's whole curve) is cached per session,
 * so the 96-sample computation only runs when the active night, its colour
 * or its name changes -- not on every reveal tick. The chart is redrawn on
 * every tick because its progress dot moves.
 *
 * `renderOverlayTo(ctx, width, height)` mirrors the live DOM overlay onto a
 * 2D canvas at the given size, used by the video exporter to capture
 * the same visual the user sees.
 */

import { buildTimeline, formatDuration, formatGb, type TimelinePoint } from '../model/timeline';
import type { OverlayVisibility } from './session_panel';
import type { Store } from './store';
import type { AppState } from './session_panel';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  chartWindowForSpan,
  computeAltitudeSeries,
  drawAltitudeChart,
  type AltitudeChartData,
} from './altitude_chart';
import { parseFitsDate } from '../astro/date_parse';
import { roundRect } from './canvas_utils';
import { clear, el } from './dom';

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
  chart: AltitudeChartData | null;
  visibility: OverlayVisibility;
}

type ChartBase = Omit<AltitudeChartData, 'currentMs'>;

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
  }) as HTMLCanvasElement;
  const pixelRatio = window.devicePixelRatio || 1;
  chartCanvas.width = Math.round(CHART_WIDTH * pixelRatio);
  chartCanvas.height = Math.round(CHART_HEIGHT * pixelRatio);
  chartCanvas.style.width = `${CHART_WIDTH}px`;
  chartCanvas.style.height = `${CHART_HEIGHT}px`;
  chartWrap.appendChild(chartCanvas);
  root.append(counter, stats, chartWrap);

  const ctx = chartCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for altitude chart canvas');
  }

  let cachedChartKey: string | null = null;
  let cachedChartBase: ChartBase | null = null;
  let lastTimeline: TimelinePoint[] = [];
  let currentVisibility: OverlayVisibility = store.get().overlay;
  let currentSnapshot: OverlaySnapshot = emptySnapshot(currentVisibility);
  let hasPoint = false;
  let hasChart = false;

  const drawLiveChart = (chart: AltitudeChartData | null) => {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, chart);
  };

  const recompute = (state: AppState) => {
    if (lastTimeline.length === 0 && state.project.sessions.length > 0) {
      lastTimeline = buildTimeline(state.project);
    } else if (state.project.sessions.length === 0) {
      lastTimeline = [];
    }
    if (!arraysMatchTimeline(lastTimeline, state)) {
      lastTimeline = buildTimeline(state.project);
      cachedChartKey = null;
      cachedChartBase = null;
    }

    currentVisibility = state.overlay;
    const playback = state.playback;
    const point = lastTimeline[playback.revealCount - 1];
    hasPoint = Boolean(point);

    // Before playback starts the chart previews the first night's curve.
    const chartPoint = point ?? lastTimeline[0];
    const chartBase = chartPoint ? chartBaseFor(chartPoint, lastTimeline, state) : null;
    const chart: AltitudeChartData | null = chartBase
      ? {
          ...chartBase,
          currentMs: point ? (parseFitsDate(point.light.dateObs)?.getTime() ?? null) : null,
        }
      : null;
    hasChart = chart !== null;
    applyVisibility(state.overlay, hasPoint, hasChart);
    drawLiveChart(chart);

    if (!point) {
      counter.textContent = formatDuration(0);
      stats.replaceChildren();
      currentSnapshot = {
        counterText: formatDuration(0),
        statsLines: [],
        chart,
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

    currentSnapshot = {
      counterText: formatDuration(point.cumulativeExptimeS),
      statsLines,
      chart,
      visibility: currentVisibility,
    };
  };

  const chartBaseFor = (
    point: TimelinePoint,
    timeline: TimelinePoint[],
    state: AppState,
  ): ChartBase | null => {
    const session = state.project.sessions[point.nightIndex - 1];
    if (!session) return null;
    const key = `${point.nightIndex}|${session.color}|${session.name}`;
    if (cachedChartKey !== key) {
      cachedChartKey = key;
      cachedChartBase = buildChartBase(point, timeline, session.color, session.name);
    }
    return cachedChartBase;
  };

  store.subscribe(recompute);
  recompute(store.get());

  return {
    getSnapshot: () => currentSnapshot,
    setVisibility: (visibility: OverlayVisibility) => {
      currentVisibility = visibility;
      currentSnapshot = { ...currentSnapshot, visibility };
      applyVisibility(visibility, hasPoint, hasChart);
    },
  };
}

function emptySnapshot(visibility: OverlayVisibility): OverlaySnapshot {
  return { counterText: formatDuration(0), statsLines: [], chart: null, visibility };
}

export function renderOverlayTo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: OverlaySnapshot,
): void {
  ctx.save();
  if (snapshot.visibility.visible && snapshot.visibility.counter) {
    drawCounter(ctx, snapshot.counterText);
  }
  if (snapshot.visibility.visible && snapshot.visibility.stats) {
    drawStats(ctx, snapshot.statsLines);
  }
  if (snapshot.visibility.visible && snapshot.visibility.chart && snapshot.chart) {
    ctx.translate(
      width - CHART_WIDTH - CHART_RIGHT_OFFSET,
      height - CHART_HEIGHT - CHART_BOTTOM_OFFSET,
    );
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, snapshot.chart);
  }
  ctx.restore();
}

function drawCounter(ctx: CanvasRenderingContext2D, text: string): void {
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
}

function drawStats(ctx: CanvasRenderingContext2D, lines: { label: string; value: string }[]): void {
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

function applyVisibility(
  visibility: OverlayVisibility,
  hasPoint: boolean,
  hasChart: boolean,
): void {
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
    chart.style.display = visibility.visible && visibility.chart && hasChart ? 'block' : 'none';
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

/** The night's whole altitude curve, or null when the light lacks target, site or date. */
function buildChartBase(
  point: TimelinePoint,
  timeline: TimelinePoint[],
  color: string,
  title: string,
): ChartBase | null {
  const light = point.light;
  if (
    light.objRaDeg === null ||
    light.objDecDeg === null ||
    light.siteLatDeg === null ||
    light.siteLonDeg === null
  ) {
    return null;
  }

  let spanStartMs = Infinity;
  let spanEndMs = -Infinity;
  for (const candidate of timeline) {
    if (candidate.nightIndex !== point.nightIndex) continue;
    const ms = parseFitsDate(candidate.light.dateObs)?.getTime();
    if (ms === undefined) continue;
    spanStartMs = Math.min(spanStartMs, ms);
    spanEndMs = Math.max(spanEndMs, ms);
  }
  if (!Number.isFinite(spanStartMs)) return null;

  const window = chartWindowForSpan(spanStartMs, spanEndMs);
  const altitudes = computeAltitudeSeries(
    { latitudeDeg: light.siteLatDeg, longitudeDeg: light.siteLonDeg },
    { raDeg: light.objRaDeg, decDeg: light.objDecDeg },
    window,
  );
  return { ...window, altitudes, spanStartMs, spanEndMs, color, title };
}
