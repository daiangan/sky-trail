/**
 * Floating view controls over the dome canvas: zoom in/out, a pan toggle and
 * a "recenter" button, plus a short hint that fades after the first
 * interaction. Panning used to exist only as an undiscoverable right-click /
 * Shift-drag gesture, with no way back once the dome was moved off-screen.
 */

import type { DomeView, InteractionMode } from '../render/dome_view';
import { el } from './dom';

type ViewControls = Pick<
  DomeView,
  | 'recenter'
  | 'zoomIn'
  | 'zoomOut'
  | 'setInteractionMode'
  | 'getInteractionMode'
  | 'onCameraInteraction'
>;

const HINT_VISIBLE_MS = 9000;

const ICONS = {
  zoomIn:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  zoomOut:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  pan: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  recenter:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/><circle cx="12" cy="12" r="2.5"/></svg>',
};

function hintFor(mode: InteractionMode): string {
  return mode === 'pan'
    ? 'Drag to move · Shift + drag to rotate · Scroll to zoom · Double-click to recenter'
    : 'Drag to rotate · Shift or right-drag to move · Scroll to zoom · Double-click to recenter';
}

function iconButton(label: string, icon: string, extraClass = ''): HTMLButtonElement {
  const button = el('button', {
    class: `view-toolbar__btn ${extraClass}`.trim(),
    type: 'button',
    title: label,
    'aria-label': label,
  });
  button.innerHTML = icon;
  return button;
}

export function mountViewToolbar(canvasArea: HTMLElement, view: ViewControls): () => void {
  const zoomOut = iconButton('Zoom out', ICONS.zoomOut);
  const zoomIn = iconButton('Zoom in', ICONS.zoomIn);
  const pan = iconButton('Move the dome (drag to pan)', ICONS.pan);
  const recenter = iconButton('Recenter the dome', ICONS.recenter);
  pan.setAttribute('aria-pressed', 'false');

  const toolbar = el('div', { class: 'view-toolbar', role: 'toolbar', 'aria-label': 'View' }, [
    zoomOut,
    zoomIn,
    el('span', { class: 'view-toolbar__divider' }),
    pan,
    recenter,
  ]);
  const hint = el('div', { class: 'view-hint' }, [hintFor(view.getInteractionMode())]);
  const wrap = el('div', { class: 'view-controls' }, [hint, toolbar]);
  canvasArea.appendChild(wrap);

  let hintTimer: number | undefined;
  const hideHint = () => {
    hint.classList.add('view-hint--hidden');
  };
  const showHint = () => {
    hint.classList.remove('view-hint--hidden');
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(hideHint, HINT_VISIBLE_MS);
  };
  showHint();

  zoomOut.addEventListener('click', () => view.zoomOut());
  zoomIn.addEventListener('click', () => view.zoomIn());
  recenter.addEventListener('click', () => view.recenter());
  pan.addEventListener('click', () => {
    const next: InteractionMode = view.getInteractionMode() === 'pan' ? 'orbit' : 'pan';
    view.setInteractionMode(next);
    pan.setAttribute('aria-pressed', String(next === 'pan'));
    pan.classList.toggle('view-toolbar__btn--active', next === 'pan');
    hint.textContent = hintFor(next);
    showHint();
  });

  const unsubscribe = view.onCameraInteraction(hideHint);

  return () => {
    window.clearTimeout(hintTimer);
    unsubscribe();
    wrap.remove();
  };
}
