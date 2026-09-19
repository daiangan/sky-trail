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
  onSurfaceOpacityChange?: (value: number) => void;
  onFloorOpacityChange?: (value: number) => void;
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

  // --- top action buttons -----------------------------------------------

  const playBtn = el('button', { class: 'btn btn--primary', id: 'play-btn', type: 'button' }, [
    '▶ Play',
  ]);
  const exportBtn = el('button', { class: 'btn btn--export', id: 'export-btn', type: 'button' }, [
    'Export Video…',
  ]);
  playBtn.addEventListener('click', () => handlers.onPlayPause());
  exportBtn.addEventListener('click', () => handlers.onExport());

  const resetBtn = el('button', { class: 'btn', id: 'reset-btn', type: 'button' }, ['↺ Reset']);
  const coordsBtn = el('button', { class: 'btn', id: 'coords-btn', type: 'button' }, [
    'Object Coordinates…',
  ]);
  resetBtn.addEventListener('click', () => handlers.onReset());
  coordsBtn.addEventListener('click', () => handlers.onCoordinates());

  const primaryRow = el('div', { class: 'controls__row controls__row--buttons' }, [
    playBtn,
    exportBtn,
  ]);
  const secondaryRow = el('div', { class: 'controls__row controls__row--buttons' }, [
    resetBtn,
    coordsBtn,
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

  const surfaceOpacity = slider({
    id: 'surface-opacity',
    label: 'Dome surface',
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
    unit: '%',
    onInput: (value) => handlers.onSurfaceOpacityChange?.(value / 100),
  });

  const floorOpacity = slider({
    id: 'floor-opacity',
    label: 'Dome floor',
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
    unit: '%',
    onInput: (value) => handlers.onFloorOpacityChange?.(value / 100),
  });

  // --- overlay toggles --------------------------------------------------

  const overlayToggle = overlayToggles(store.get().overlay, (visibility) => {
    store.set((s) => ({ ...s, overlay: visibility }));
  });

  root.append(
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Playback & Actions']),
      primaryRow,
      secondaryRow,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Animation']),
      arcSpeed.root,
      cameraSpeed.root,
      pointSize.root,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Dome']),
      surfaceOpacity.root,
      floorOpacity.root,
    ]),
    el('section', { class: 'controls__section' }, [
      el('h2', { class: 'controls__title' }, ['Overlay']),
      overlayToggle.root,
    ]),
    createGithubFooter(),
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

  const updateDisabledState = (masterVisible: boolean) => {
    counterCheckbox.disabled = !masterVisible;
    statsCheckbox.disabled = !masterVisible;
    chartCheckbox.disabled = !masterVisible;
    subGroup.classList.toggle('toggles__subgroup--dimmed', !masterVisible);
  };

  masterCheckbox.addEventListener('change', () => {
    updateDisabledState(masterCheckbox.checked);
    emit();
  });

  counterCheckbox.addEventListener('change', emit);
  statsCheckbox.addEventListener('change', emit);
  chartCheckbox.addEventListener('change', emit);

  const subGroup = el('div', { class: 'toggles__subgroup' }, [
    toggleRow(counterCheckbox, 'Exposure counter'),
    toggleRow(statsCheckbox, 'Stats panel'),
    toggleRow(chartCheckbox, 'Altitude chart'),
  ]);

  updateDisabledState(initial.visible);

  const root = el('div', { class: 'toggles' }, [
    toggleRow(masterCheckbox, 'Show overlay', true),
    subGroup,
  ]);

  return {
    root,
    setVisibility: (visibility: OverlayVisibility) => {
      masterCheckbox.checked = visibility.visible;
      counterCheckbox.checked = visibility.counter;
      statsCheckbox.checked = visibility.stats;
      chartCheckbox.checked = visibility.chart;
      updateDisabledState(visibility.visible);
    },
  };
}

function toggleRow(checkbox: HTMLInputElement, label: string, isMaster = false): HTMLElement {
  return el('label', { class: `toggle${isMaster ? ' toggle--master' : ''}` }, [
    checkbox,
    el('span', { class: 'toggle__label' }, [label]),
  ]);
}

function createGithubFooter(): HTMLElement {
  const footer = el('footer', { class: 'controls__footer' });
  const a = el(
    'a',
    {
      class: 'github-link',
      href: 'https://github.com/daiangan/sky-trail',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: 'SkyTrail on GitHub',
    },
    [el('span', {}, ['GitHub Repository'])],
  );
  const icon = document.createElement('span');
  icon.className = 'github-icon';
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" style="display:inline-block;vertical-align:middle;"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`;
  a.prepend(icon);
  footer.append(a);
  return footer;
}
