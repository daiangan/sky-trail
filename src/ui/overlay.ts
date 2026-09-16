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
 */

import { buildTimeline, type TimelinePoint } from '../model/timeline';
import { formatDuration, formatGb } from '../model/timeline';
import { ALTITUDE_CHART_HOURS, computeAltitudeCurve, drawAltitudeChart } from './altitude_chart';
import { clear, el } from './dom';
import type { OverlayVisibility } from './session_panel';
import type { Store } from './store';
import type { AppState } from './session_panel';

const CHART_WIDTH = 220;
const CHART_HEIGHT = 120;

export function mountOverlay(
  root: HTMLElement,
  store: Store<AppState>,
): { setVisibility: (state: OverlayVisibility) => void } {
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
  chartCanvas.width = CHART_WIDTH;
  chartCanvas.height = CHART_HEIGHT;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  let cachedNightIndex: number | null = null;
  let cachedCurve: number[] | null = null;
  let lastTimeline: TimelinePoint[] = [];

  const update = (state: AppState) => {
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

    applyVisibility(state.overlay);
    const snapshot = state.playback;
    const point = lastTimeline[snapshot.revealCount - 1];

    if (!point) {
      counter.textContent = formatDuration(0);
      stats.replaceChildren();
      drawEmptyChart(ctx);
      return;
    }

    counter.textContent = formatDuration(point.cumulativeExptimeS);
    stats.replaceChildren(
      el('div', {}, [
        el('span', { class: 'overlay__label' }, ['Subframes:']),
        ` ${point.cumulativeSubframes}`,
      ]),
      el('div', {}, [
        el('span', { class: 'overlay__label' }, ['Data:']),
        ` ${formatGb(point.cumulativeBytes)}`,
      ]),
      el('div', {}, [
        el('span', { class: 'overlay__label' }, ['Date:']),
        ` ${(point.light.dateObs ?? '').slice(0, 10)}`,
      ]),
      el('div', {}, [
        el('span', { class: 'overlay__label' }, ['Night:']),
        ` ${point.nightIndex} of ${point.totalNights}`,
      ]),
    );

    if (cachedNightIndex !== point.nightIndex) {
      cachedNightIndex = point.nightIndex;
      cachedCurve = computeCurveForPoint(point);
    }

    drawChart(ctx, cachedCurve ?? [], ALTITUDE_CHART_HOURS);
  };

  store.subscribe(update);
  update(store.get());

  return {
    setVisibility: (visibility: OverlayVisibility) => {
      applyVisibility(visibility);
    },
  };
}

function applyVisibility(visibility: OverlayVisibility): void {
  const counter = document.getElementById('overlay-counter');
  const stats = document.getElementById('overlay-stats');
  const chart = document.getElementById('overlay-chart-wrap');
  if (counter)
    counter.style.display = visible(visibility.visible && visibility.counter) ? 'block' : 'none';
  if (stats)
    stats.style.display = visible(visibility.visible && visibility.stats) ? 'block' : 'none';
  if (chart)
    chart.style.display = visible(visibility.visible && visibility.chart) ? 'block' : 'none';
}

function visible(on: boolean): boolean {
  return on;
}

function arraysMatchTimeline(timeline: TimelinePoint[], state: AppState): boolean {
  const sessions = state.project.sessions;
  if (timeline.length === 0) return sessions.length === 0;
  // Cheap structural check: same session count and same total light count.
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
  const endTime = new Date(light.dateObs);
  if (Number.isNaN(endTime.getTime())) return null;
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
