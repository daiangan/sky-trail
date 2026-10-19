/**
 * Small transient notifications for things the user should know about but
 * that don't block the flow: files added, files skipped, a load that failed.
 * Warnings and errors use `role="alert"` so assistive tech announces them
 * immediately; the rest are polite status messages.
 */

import { el } from './dom';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds before auto-dismiss; 0 keeps it until closed. */
  durationMs?: number;
}

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  info: 5000,
  success: 5000,
  warning: 12000,
  error: 12000,
};

let layer: HTMLElement | null = null;

function getLayer(): HTMLElement {
  if (layer && layer.isConnected) return layer;
  layer = el('div', { class: 'toast-layer' });
  document.body.appendChild(layer);
  return layer;
}

export function showToast(options: ToastOptions): () => void {
  const kind = options.kind ?? 'info';
  const urgent = kind === 'warning' || kind === 'error';

  const closeBtn = el(
    'button',
    { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss notification' },
    ['×'],
  );
  const children: Array<Node | string> = [
    el('span', { class: 'toast__message' }, [options.message]),
  ];
  let actionBtn: HTMLButtonElement | null = null;
  if (options.actionLabel && options.onAction) {
    actionBtn = el('button', { class: 'toast__action', type: 'button' }, [options.actionLabel]);
    children.push(actionBtn);
  }
  children.push(closeBtn);

  const toast = el(
    'div',
    { class: `toast toast--${kind}`, role: urgent ? 'alert' : 'status' },
    children,
  );

  let timer: number | undefined;
  const dismiss = () => {
    window.clearTimeout(timer);
    toast.remove();
  };
  closeBtn.addEventListener('click', dismiss);
  actionBtn?.addEventListener('click', () => {
    options.onAction?.();
    dismiss();
  });

  getLayer().appendChild(toast);
  const duration = options.durationMs ?? DEFAULT_DURATION_MS[kind];
  if (duration > 0) timer = window.setTimeout(dismiss, duration);
  return dismiss;
}
