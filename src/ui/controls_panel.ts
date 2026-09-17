/**
 * Right-hand controls panel: speeds, point size, play/pause/reset,
 * overlay toggles, and the entry points for the manual coordinates
 * dialog and the video export. Section 3.10 of the migration prompt.
 *
 * Inputs commit on `change` (blur) rather than `input` (keystroke),
 * so the panel never re-renders while the user is dragging and focus
 * stays put. Sliders are the exception -- they DO need live feedback
 * for the controlled value (the dome should rotate as you drag the
 * speed slider), so they use `input` and the parent is expected to
 * debounce or batch.
 */

import type { PlaybackSnapshot } from '../render/playback_controller';
import { clear, el } from './dom';
import type { OverlayVisibility } from './session_panel';
import type { Store } from './store';
import type { AppState } from './session_panel';

export interface ControlsPanelHandlers {
  onPointsPerSecondChange: (value: number) => void;
  onCameraSpeedChange: (value: number) => void;
  onPointSizeChange: (value: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onCoordinates: () => void;
  onExport: () => void;
}

export interface ControlsPanelApi {
  setPlaybackState: (snapshot: PlaybackSnapshot) => void;
}

export function mountControlsPanel(
  root: HTMLElement,
  store: Store<AppState>,
  handlers: ControlsPanelHandlers,
): ControlsPanelApi {
  clear(root);
  root.classList.add('controls-panel');

  // --- playback buttons -------------------------------------------------

  const playBtn = el('button', { class: 'btn btn--primary', id: 'play-btn', type: 'button' }, [
    '▶ Play',
  ]);
  const resetBtn = el('button', { class: 'btn', id: 'reset-btn', type: 'button' }, ['↺ Reset']);
  playBtn.addEventListener('click', () => handlers.onPlayPause());
  resetBtn.addEventListener('click', () => handlers.onReset());
  const playbackRow = el('div', { class: 'controls__row controls__row--buttons' }, [
    playBtn,
    resetBtn,
  ]);

  // --- sliders ----------------------------------------------------------

  const arcSpeed = slider({
    id: 'arc-speed',
    label: 'Arc speed',
    min: 0.1,
    max: 500,
    step: 0.1,
    initialValue: store.get().playback.pointsPerSecond,
    unit: ' pts/sec',
    onInput: (value) => handlers.onPointsPerSecondChange(value),
  });

  const cameraSpeed = slider({
    id: 'camera-speed',
    label: 'Camera rotation',
    min: 0,
    max: 60,
    step: 1,
    initialValue: 0,
    unit: ' °/sec',
    onInput: (value) => handlers.onCameraSpeedChange(value),
  });

  const pointSize = slider({
    id: 'point-size',
    label: 'Point size',
    min: 1,
    max: 20,
    step: 1,
    initialValue: 6,
    unit: ' px',
    onInput: (value) => handlers.onPointSizeChange(value),
  });

  // --- overlay toggles --------------------------------------------------

  const overlayToggle = overlayToggles(store.get().overlay, (visibility) => {
    store.set((s) => ({ ...s, overlay: visibility }));
  });

  // --- footer buttons ---------------------------------------------------

  const coordsBtn = el('button', { class: 'btn', id: 'coords-btn', type: 'button' }, [
    'Object / Site Coordinates…',
  ]);
  const exportBtn = el('button', { class: 'btn', id: 'export-btn', type: 'button' }, [
    'Export to Video…',
  ]);
  coordsBtn.addEventListener('click', () => handlers.onCoordinates());
  exportBtn.addEventListener('click', () => handlers.onExport());
  const footerRow = el('div', { class: 'controls__row controls__row--buttons' }, [
    coordsBtn,
    exportBtn,
  ]);

  root.append(
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Playback']),
      playbackRow,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Animation']),
      arcSpeed.root,
      cameraSpeed.root,
      pointSize.root,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Overlay']),
      overlayToggle.root,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Project']),
      footerRow,
    ]),
  );

  store.subscribe((state) => {
    overlayToggle.setVisibility(state.overlay);
  });

  return {
    setPlaybackState: (snapshot) => {
      playBtn.textContent = snapshot.isPlaying ? '❚❚ Pause' : '▶ Play';
      playBtn.disabled = snapshot.timelineLength === 0;
      resetBtn.disabled = snapshot.revealCount === 0;
      exportBtn.disabled = snapshot.timelineLength === 0;
    },
  };
}

interface SliderConfig {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  unit: string;
  onInput: (value: number) => void;
}

interface SliderHandles {
  root: HTMLElement;
  setValue: (value: number) => void;
}

function slider(config: SliderConfig): SliderHandles {
  const valueLabel = el('span', { class: 'slider__value' }, [
    `${config.initialValue}${config.unit}`,
  ]);
  const range = el('input', {
    class: 'slider__range',
    type: 'range',
    id: config.id,
    min: String(config.min),
    max: String(config.max),
    step: String(config.step),
    value: String(config.initialValue),
  }) as HTMLInputElement;
  range.addEventListener('input', () => {
    const value = Number(range.value);
    valueLabel.textContent = `${value}${config.unit}`;
    config.onInput(value);
  });
  const root = el('div', { class: 'slider' }, [
    el('label', { class: 'slider__label', for: config.id }, [config.label]),
    range,
    valueLabel,
  ]);
  return {
    root,
    setValue: (value: number) => {
      range.value = String(value);
      valueLabel.textContent = `${value}${config.unit}`;
    },
  };
}

interface OverlayToggleHandles {
  root: HTMLElement;
  setVisibility: (visibility: OverlayVisibility) => void;
}

function overlayToggles(
  initial: OverlayVisibility,
  onChange: (visibility: OverlayVisibility) => void,
): OverlayToggleHandles {
  const masterCheckbox = el('input', {
    type: 'checkbox',
    id: 'overlay-master',
  }) as HTMLInputElement;
  const counterCheckbox = el('input', {
    type: 'checkbox',
    id: 'overlay-counter-toggle',
  }) as HTMLInputElement;
  const statsCheckbox = el('input', {
    type: 'checkbox',
    id: 'overlay-stats-toggle',
  }) as HTMLInputElement;
  const chartCheckbox = el('input', {
    type: 'checkbox',
    id: 'overlay-chart-toggle',
  }) as HTMLInputElement;

  masterCheckbox.checked = initial.visible;
  counterCheckbox.checked = initial.counter;
  statsCheckbox.checked = initial.stats;
  chartCheckbox.checked = initial.chart;

  const emit = () => {
    onChange({
      visible: masterCheckbox.checked,
      counter: counterCheckbox.checked,
      stats: statsCheckbox.checked,
      chart: chartCheckbox.checked,
    });
  };

  masterCheckbox.addEventListener('change', () => {
    const allOn = masterCheckbox.checked;
    counterCheckbox.checked = allOn;
    statsCheckbox.checked = allOn;
    chartCheckbox.checked = allOn;
    emit();
  });
  for (const cb of [counterCheckbox, statsCheckbox, chartCheckbox]) {
    cb.addEventListener('change', () => {
      masterCheckbox.checked =
        counterCheckbox.checked && statsCheckbox.checked && chartCheckbox.checked;
      emit();
    });
  }

  const root = el('div', { class: 'toggles' }, [
    toggleRow(masterCheckbox, 'Show overlay'),
    toggleRow(counterCheckbox, 'Exposure counter'),
    toggleRow(statsCheckbox, 'Stats panel'),
    toggleRow(chartCheckbox, 'Altitude chart'),
  ]);

  return {
    root,
    setVisibility: (visibility: OverlayVisibility) => {
      masterCheckbox.checked = visibility.visible;
      counterCheckbox.checked = visibility.counter;
      statsCheckbox.checked = visibility.stats;
      chartCheckbox.checked = visibility.chart;
    },
  };
}

function toggleRow(checkbox: HTMLInputElement, label: string): HTMLElement {
  return el('label', { class: 'toggle' }, [
    checkbox,
    el('span', { class: 'toggle__label' }, [label]),
  ]);
}
