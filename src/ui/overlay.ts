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
 * The panel and the chart can be dragged anywhere over the dome. Their spots
 * live in the app state (see overlay_layout.ts) so the exported video draws
 * them where the user put them.
 *
 * `renderOverlayTo(ctx, width, height)` mirrors the live DOM overlay onto a
 * 2D canvas at the given size, used by the video exporter to capture
 * the same visual the user sees.
 */

import {
  buildTimeline,
  formatDuration,
  formatDataSize,
  type TimelinePoint,
} from '../model/timeline';
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
import { announce } from './announce';
import { roundRect } from './canvas_utils';
import { clear, el } from './dom';
import {
  clampOrigin,
  originFor,
  positionFromOrigin,
  type OverlayId,
  type OverlayPositions,
  type Size,
} from './overlay_layout';

const HUD_WIDTH = 204;
const HUD_RADIUS = 10;
const COUNTER_BLOCK_HEIGHT = 58;
const COUNTER_FONT = "700 26px 'Outfit', 'Inter', system-ui, sans-serif";
const STATS_PADDING = 12;
const STATS_LINE_HEIGHT = 21;
const STATS_FONT = "500 13px 'Inter', system-ui, sans-serif";
const STATS_LABEL_FONT = "600 11px 'Inter', system-ui, sans-serif";
/** Pointer travel, in px, before a press on an overlay counts as a drag rather than a click. */
const DRAG_THRESHOLD = 3;

export interface OverlaySnapshot {
  counterText: string;
  statsLines: { label: string; value: string }[];
  chart: AltitudeChartData | null;
  visibility: OverlayVisibility;
  positions: OverlayPositions;
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
  const hud = el('div', { class: 'overlay__hud', id: 'overlay-hud' }, [counter, stats]);
  root.append(hud, chartWrap);

  const ctx = chartCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for altitude chart canvas');
  }

  let cachedChartKey: string | null = null;
  let cachedChartBase: ChartBase | null = null;
  let lastTimeline: TimelinePoint[] = [];
  let lastProject: AppState['project'] | null = null;
  let currentVisibility: OverlayVisibility = store.get().overlay;
  let currentSnapshot: OverlaySnapshot = emptySnapshot(
    currentVisibility,
    store.get().overlayPositions,
  );
  let hasPoint = false;
  let hasChart = false;
  let announcedNight: number | null = null;
  let announcedFinish = false;

  const drawLiveChart = (chart: AltitudeChartData | null) => {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, chart);
  };

  const renderContent = (state: AppState) => {
    // The project is immutable, so a new object means lights, sessions or
    // colours changed and the cached timeline and chart are stale.
    if (state.project !== lastProject) {
      lastProject = state.project;
      lastTimeline = state.project.sessions.length > 0 ? buildTimeline(state.project) : [];
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
      announcedNight = null;
      announcedFinish = false;
      counter.textContent = formatDuration(0);
      stats.replaceChildren();
      currentSnapshot = {
        counterText: formatDuration(0),
        statsLines: [],
        chart,
        visibility: currentVisibility,
        positions: state.overlayPositions,
      };
      return;
    }

    if (playback.isPlaying && point.nightIndex !== announcedNight) {
      announce(`Night ${point.nightIndex} of ${point.totalNights}`);
    }
    announcedNight = point.nightIndex;
    if (playback.isFinished && !announcedFinish) {
      announce(
        `Animation complete: ${formatDuration(point.cumulativeExptimeS)} across ${point.cumulativeSubframes} subframes.`,
      );
    }
    announcedFinish = playback.isFinished;

    counter.textContent = formatDuration(point.cumulativeExptimeS);
    const statsLines = [
      { label: 'Subframes', value: String(point.cumulativeSubframes) },
      { label: 'Data', value: formatDataSize(point.cumulativeBytes) },
      { label: 'Date', value: (point.light.dateObs ?? '').slice(0, 10) },
      { label: 'Night', value: `${point.nightIndex} of ${point.totalNights}` },
    ];
    stats.replaceChildren(
      ...statsLines.map((line) =>
        el('div', { class: 'overlay__row' }, [
          el('span', { class: 'overlay__label' }, [line.label]),
          el('span', { class: 'overlay__value' }, [line.value]),
        ]),
      ),
    );

    currentSnapshot = {
      counterText: formatDuration(point.cumulativeExptimeS),
      statsLines,
      chart,
      visibility: currentVisibility,
      positions: state.overlayPositions,
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

  const canvasSize = (): Size => ({ width: root.clientWidth, height: root.clientHeight });
  const boxOf = (element: HTMLElement): Size => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };
  const movable: Array<{ id: OverlayId; element: HTMLElement }> = [
    { id: 'hud', element: hud },
    { id: 'chart', element: chartWrap },
  ];

  /** Puts each overlay at its stored spot, or back at its default corner. */
  const placeOverlays = (positions: OverlayPositions) => {
    const canvas = canvasSize();
    for (const { id, element } of movable) {
      const moved = positions[id] !== undefined;
      element.classList.toggle('overlay--moved', moved);
      if (!moved) {
        element.style.left = '';
        element.style.top = '';
        continue;
      }
      const origin = originFor(id, positions, canvas, boxOf(element));
      element.style.left = `${origin.left}px`;
      element.style.top = `${origin.top}px`;
    }
  };

  const makeDraggable = (id: OverlayId, element: HTMLElement) => {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const canvas = canvasSize();
      const box = boxOf(element);
      const rootRect = root.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const start = { x: event.clientX, y: event.clientY };
      let origin = { left: rect.left - rootRect.left, top: rect.top - rootRect.top };
      let dragged = false;

      element.setPointerCapture(event.pointerId);
      element.classList.add('overlay--dragging');

      const move = (e: PointerEvent) => {
        if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) {
          return;
        }
        dragged = true;
        element.classList.add('overlay--moved');
        origin = clampOrigin(
          { left: e.clientX - rootRect.left - grab.x, top: e.clientY - rootRect.top - grab.y },
          canvas,
          box,
        );
        element.style.left = `${origin.left}px`;
        element.style.top = `${origin.top}px`;
      };
      const end = () => {
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', end);
        element.removeEventListener('pointercancel', end);
        element.classList.remove('overlay--dragging');
        if (!dragged) {
          // A plain click moves nothing; restore whatever the state says.
          placeOverlays(store.get().overlayPositions);
          return;
        }
        const position = positionFromOrigin(origin, canvas, box);
        store.set((s) => ({ ...s, overlayPositions: { ...s.overlayPositions, [id]: position } }));
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', end);
      element.addEventListener('pointercancel', end);
    });
  };
  for (const { id, element } of movable) makeDraggable(id, element);

  // Positions depend on the size of the overlays, which change with their content.
  const recompute = (state: AppState) => {
    renderContent(state);
    placeOverlays(state.overlayPositions);
  };
  new ResizeObserver(() => placeOverlays(store.get().overlayPositions)).observe(root);

  store.subscribe(recompute);
  recompute(store.get());

  return {
    getSnapshot: () => currentSnapshot,
    setVisibility: (visibility: OverlayVisibility) => {
      currentVisibility = visibility;
      currentSnapshot = { ...currentSnapshot, visibility };
      applyVisibility(visibility, hasPoint, hasChart);
      placeOverlays(store.get().overlayPositions);
    },
  };
}

function emptySnapshot(
  visibility: OverlayVisibility,
  positions: OverlayPositions,
): OverlaySnapshot {
  return { counterText: formatDuration(0), statsLines: [], chart: null, visibility, positions };
}

export function renderOverlayTo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: OverlaySnapshot,
): void {
  const canvas = { width, height };
  const { visible, counter, stats, chart } = snapshot.visibility;
  if (visible) {
    ctx.save();
    drawHud(ctx, canvas, snapshot, counter, stats);
    ctx.restore();
  }
  if (visible && chart && snapshot.chart) {
    ctx.save();
    const origin = originFor('chart', snapshot.positions, canvas, {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
    });
    ctx.translate(origin.left, origin.top);
    drawAltitudeChart(ctx, CHART_WIDTH, CHART_HEIGHT, snapshot.chart);
    ctx.restore();
  }
}

/** Counter and stats share one glass panel, mirroring the DOM `.overlay__hud`. */
function drawHud(
  ctx: CanvasRenderingContext2D,
  canvas: Size,
  snapshot: OverlaySnapshot,
  showCounter: boolean,
  showStats: boolean,
): void {
  const lines = showStats ? snapshot.statsLines : [];
  const statsHeight = lines.length > 0 ? lines.length * STATS_LINE_HEIGHT + STATS_PADDING * 2 : 0;
  const counterHeight = showCounter ? COUNTER_BLOCK_HEIGHT : 0;
  const height = counterHeight + statsHeight;
  if (height === 0) return;

  const origin = originFor('hud', snapshot.positions, canvas, { width: HUD_WIDTH, height });
  ctx.translate(origin.left, origin.top);

  ctx.fillStyle = 'rgba(8, 10, 18, 0.62)';
  roundRect(ctx, 0, 0, HUD_WIDTH, height, HUD_RADIUS);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 132, 158, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (showCounter) {
    ctx.fillStyle = 'rgb(226, 231, 244)';
    ctx.font = COUNTER_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(snapshot.counterText, 16, counterHeight / 2 + 1);
  }

  if (lines.length > 0) {
    const top = counterHeight;
    if (showCounter) {
      ctx.strokeStyle = 'rgba(120, 132, 158, 0.28)';
      ctx.beginPath();
      ctx.moveTo(12, top + 0.5);
      ctx.lineTo(HUD_WIDTH - 12, top + 0.5);
      ctx.stroke();
    }
    ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i += 1) {
      const y = top + STATS_PADDING + i * STATS_LINE_HEIGHT + STATS_LINE_HEIGHT / 2;
      ctx.textAlign = 'left';
      ctx.font = STATS_LABEL_FONT;
      ctx.fillStyle = 'rgba(170, 178, 198, 0.95)';
      ctx.fillText(lines[i]!.label.toUpperCase(), 16, y);
      ctx.textAlign = 'right';
      ctx.font = STATS_FONT;
      ctx.fillStyle = 'rgb(226, 231, 244)';
      ctx.fillText(lines[i]!.value, HUD_WIDTH - 16, y);
    }
  }
}

function applyVisibility(
  visibility: OverlayVisibility,
  hasPoint: boolean,
  hasChart: boolean,
): void {
  const hud = document.getElementById('overlay-hud');
  const counter = document.getElementById('overlay-counter');
  const stats = document.getElementById('overlay-stats');
  const chart = document.getElementById('overlay-chart-wrap');
  const showCounter = visibility.visible && visibility.counter;
  const showStats = visibility.visible && visibility.stats && hasPoint;
  if (hud) hud.style.display = showCounter || showStats ? 'flex' : 'none';
  // `flex`, not `block`: the counter is centred vertically with flexbox.
  if (counter) counter.style.display = showCounter ? 'flex' : 'none';
  if (stats) stats.style.display = showStats ? 'flex' : 'none';
  if (chart) {
    chart.style.display = visibility.visible && visibility.chart && hasChart ? 'block' : 'none';
  }
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
