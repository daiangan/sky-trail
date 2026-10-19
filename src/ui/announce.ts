/**
 * Screen-reader announcements for visual-only events during playback (the
 * animation moving to another night, or finishing). The region is polite so it
 * never interrupts what the user is doing.
 */

import { el } from './dom';

let region: HTMLElement | null = null;

export function announce(message: string): void {
  if (!region || !region.isConnected) {
    region = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(region);
  }
  // Clearing first makes repeated identical messages announce again.
  region.textContent = '';
  const target = region;
  window.setTimeout(() => {
    target.textContent = message;
  }, 50);
}
