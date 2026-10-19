/**
 * Narrow-screen layout. Below the 900px breakpoint the dome canvas takes the
 * whole screen and the sessions and controls panels become slide-over drawers.
 * A small bar over the canvas opens them and keeps Play within reach, since
 * the real Play button lives inside the controls drawer.
 *
 * The bar and backdrop are always in the DOM but only visible below the
 * breakpoint (see `.mobile-bar` and `.drawer-backdrop` in style.css), so the
 * drawer state needs no resize handling.
 */

import { el } from './dom';
import type { AppState } from './session_panel';
import type { Store } from './store';

interface MobileLayoutOptions {
  layout: HTMLElement;
  canvasArea: HTMLElement;
  sessionsPanel: HTMLElement;
  controlsPanel: HTMLElement;
  store: Store<AppState>;
  onPlayPause: () => void;
}

const ICONS = {
  sessions:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  controls:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
};

type Drawer = 'sessions' | 'controls';

function barButton(label: string, icon: string): HTMLButtonElement {
  const button = el('button', {
    class: 'mobile-bar__btn',
    type: 'button',
    title: label,
    'aria-label': label,
  });
  button.innerHTML = icon;
  return button;
}

export function mountMobileLayout(options: MobileLayoutOptions): void {
  const { layout, canvasArea, sessionsPanel, controlsPanel, store } = options;

  sessionsPanel.id = 'sessions-panel';
  controlsPanel.id = 'controls-panel';

  const sessionsBtn = barButton('Sessions', ICONS.sessions);
  const playBtn = barButton('Play', ICONS.play);
  const controlsBtn = barButton('Controls', ICONS.controls);
  sessionsBtn.setAttribute('aria-controls', 'sessions-panel');
  controlsBtn.setAttribute('aria-controls', 'controls-panel');

  const bar = el('div', { class: 'mobile-bar' }, [sessionsBtn, playBtn, controlsBtn]);
  const backdrop = el('div', { class: 'drawer-backdrop' });
  canvasArea.appendChild(bar);
  layout.appendChild(backdrop);

  let open: Drawer | null = null;
  const setOpen = (next: Drawer | null) => {
    open = next;
    layout.classList.toggle('app-layout--sessions-open', next === 'sessions');
    layout.classList.toggle('app-layout--controls-open', next === 'controls');
    sessionsBtn.setAttribute('aria-expanded', String(next === 'sessions'));
    controlsBtn.setAttribute('aria-expanded', String(next === 'controls'));
  };
  setOpen(null);

  sessionsBtn.addEventListener('click', () => setOpen(open === 'sessions' ? null : 'sessions'));
  controlsBtn.addEventListener('click', () => setOpen(open === 'controls' ? null : 'controls'));
  backdrop.addEventListener('click', () => setOpen(null));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open !== null) setOpen(null);
  });
  playBtn.addEventListener('click', () => options.onPlayPause());

  const syncPlay = (state: AppState) => {
    const { isPlaying, timelineLength } = state.playback;
    playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    const label = isPlaying ? 'Pause' : 'Play';
    playBtn.title = label;
    playBtn.setAttribute('aria-label', label);
    playBtn.disabled = timelineLength === 0;
  };
  store.subscribe(syncPlay);
  syncPlay(store.get());
}
