/**
 * Manual coordinate entry dialog. Pre-fills with the current
 * project's fallback (if set) or whatever was last persisted to
 * localStorage; on save, updates the project fallback and writes to
 * localStorage so it survives across browser sessions. Section 3.11
 * of the migration prompt.
 */

import {
  parseManualDec,
  parseManualLatitude,
  parseManualLongitude,
  parseManualRa,
} from '../astro/coord_parse';
import { loadFallbackCoords, saveFallbackCoords } from '../model/persistence';
import { clear, el } from './dom';
import type { Store } from './store';
import type { AppState } from './session_panel';

export interface CoordinatesDialogApi {
  open: () => void;
  close: () => void;
}

export function mountCoordinatesDialog(
  root: HTMLElement,
  store: Store<AppState>,
): CoordinatesDialogApi {
  clear(root);
  root.classList.add('dialog-root');

  const remembered = loadFallbackCoords();
  const projectFallback = store.get().project;

  const raInput = el('input', {
    type: 'text',
    id: 'coords-ra',
    placeholder: 'HH:MM:SS or decimal deg',
    value: formatField(projectFallback.fallbackObjRaDeg, remembered.raDeg),
    class: 'dialog__input',
  }) as HTMLInputElement;

  const decInput = el('input', {
    type: 'text',
    id: 'coords-dec',
    placeholder: '±DD:MM:SS or decimal deg',
    value: formatField(projectFallback.fallbackObjDecDeg, remembered.decDeg),
    class: 'dialog__input',
  }) as HTMLInputElement;

  const latInput = el('input', {
    type: 'text',
    id: 'coords-lat',
    placeholder: '+ = North, – = South',
    value: formatField(projectFallback.fallbackSiteLatDeg, remembered.latDeg),
    class: 'dialog__input',
  }) as HTMLInputElement;

  const lonInput = el('input', {
    type: 'text',
    id: 'coords-lon',
    placeholder: '+ = East, – = West',
    value: formatField(projectFallback.fallbackSiteLonDeg, remembered.lonDeg),
    class: 'dialog__input',
  }) as HTMLInputElement;

  const error = el('p', { class: 'dialog__error', id: 'coords-error' });
  error.textContent = '';

  const locationBtn = el(
    'button',
    {
      class: 'btn btn--small btn--location',
      type: 'button',
      id: 'coords-location-btn',
    },
    ['📍 Use device location'],
  ) as HTMLButtonElement;

  const resetLocationBtn = () => {
    locationBtn.disabled = !('geolocation' in navigator);
    locationBtn.textContent = '📍 Use device location';
  };

  if (!('geolocation' in navigator)) {
    locationBtn.disabled = true;
    locationBtn.title = 'Geolocation is not supported by this browser';
  } else {
    locationBtn.addEventListener('click', () => {
      locationBtn.disabled = true;
      locationBtn.textContent = '⏳ Detecting…';
      error.textContent = '';

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latInput.value = pos.coords.latitude.toFixed(6);
          lonInput.value = pos.coords.longitude.toFixed(6);
          locationBtn.disabled = false;
          locationBtn.textContent = '✓ Location set';
          setTimeout(() => {
            locationBtn.textContent = '📍 Use device location';
          }, 2500);
        },
        (err) => {
          locationBtn.disabled = false;
          locationBtn.textContent = '📍 Use device location';
          if (err.code === err.PERMISSION_DENIED) {
            error.textContent = 'Location permission was denied in browser settings.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            error.textContent = 'Device location is currently unavailable.';
          } else if (err.code === err.TIMEOUT) {
            error.textContent = 'Location request timed out. Please try again.';
          } else {
            error.textContent = `Could not detect location: ${err.message || 'unknown error'}`;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }

  const cancelBtn = el('button', { class: 'btn', type: 'button', id: 'coords-cancel' }, ['Cancel']);
  const saveBtn = el('button', { class: 'btn btn--primary', type: 'button', id: 'coords-save' }, [
    'Save',
  ]);

  cancelBtn.addEventListener('click', () => api.close());
  saveBtn.addEventListener('click', () => {
    const raDeg = parseManualRa(raInput.value);
    const decDeg = parseManualDec(decInput.value);
    const latDeg = parseManualLatitude(latInput.value);
    const lonDeg = parseManualLongitude(lonInput.value);

    const invalid: string[] = [];
    if (raDeg === null && raInput.value.trim()) invalid.push('RA');
    if (decDeg === null && decInput.value.trim()) invalid.push('Dec');
    if (latDeg === null && latInput.value.trim()) invalid.push('Latitude');
    if (lonDeg === null && lonInput.value.trim()) invalid.push('Longitude');

    if (invalid.length > 0) {
      error.textContent = `Could not parse: ${invalid.join(', ')}`;
      return;
    }

    const raValue = raDeg !== null ? raDeg : null;
    const decValue = decDeg !== null ? decDeg : null;
    const latValue = latDeg !== null ? latDeg : null;
    const lonValue = lonDeg !== null ? lonDeg : null;

    saveFallbackCoords({ raDeg: raValue, decDeg: decValue, latDeg: latValue, lonDeg: lonValue });
    store.set((s) => ({
      ...s,
      project: {
        ...s.project,
        fallbackObjRaDeg: raValue,
        fallbackObjDecDeg: decValue,
        fallbackSiteLatDeg: latValue,
        fallbackSiteLonDeg: lonValue,
      },
    }));
    api.close();
  });

  const objectSectionHeader = el('div', { class: 'dialog__section-header' }, [
    el('span', { class: 'dialog__section-title' }, ['Object Target (RA / Dec)']),
  ]);

  const siteSectionHeader = el('div', { class: 'dialog__section-header' }, [
    el('span', { class: 'dialog__section-title' }, ['Site Location (Lat / Lon)']),
    locationBtn,
  ]);

  const form = el('form', { class: 'dialog__form' }, [
    objectSectionHeader,
    fieldRow('Object RA', raInput),
    fieldRow('Object Dec', decInput),
    siteSectionHeader,
    fieldRow('Site Latitude (°)', latInput),
    fieldRow('Site Longitude (°)', lonInput),
    error,
    el('div', { class: 'dialog__buttons' }, [cancelBtn, saveBtn]),
  ]) as HTMLFormElement;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveBtn.click();
  });

  const modal = el(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'coords-title' },
    [
      el('h2', { class: 'dialog__title', id: 'coords-title' }, ['Object / Site Coordinates']),
      el('p', { class: 'dialog__subtitle' }, [
        'These are remembered across browser sessions. Leave a field blank to clear it.',
      ]),
      form,
    ],
  );

  const backdrop = el('div', { class: 'dialog__backdrop' }, [modal]);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) api.close();
  });
  root.appendChild(backdrop);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('dialog-root--open')) {
      api.close();
    }
  });

  const api: CoordinatesDialogApi = {
    open: () => {
      const rem = loadFallbackCoords();
      const proj = store.get().project;
      raInput.value = formatField(proj.fallbackObjRaDeg, rem.raDeg);
      decInput.value = formatField(proj.fallbackObjDecDeg, rem.decDeg);
      latInput.value = formatField(proj.fallbackSiteLatDeg, rem.latDeg);
      lonInput.value = formatField(proj.fallbackSiteLonDeg, rem.lonDeg);
      error.textContent = '';
      resetLocationBtn();
      root.classList.add('dialog-root--open');
      raInput.focus();
    },
    close: () => {
      root.classList.remove('dialog-root--open');
      error.textContent = '';
      resetLocationBtn();
    },
  };

  return api;
}

function formatField(primary: number | null, secondary: number | null): string {
  const value = primary ?? secondary;
  if (value === null || !Number.isFinite(value)) return '';
  return value.toFixed(6);
}

function fieldRow(label: string, input: HTMLInputElement): HTMLElement {
  return el('label', { class: 'dialog__row' }, [
    el('span', { class: 'dialog__row-label' }, [label]),
    input,
  ]);
}
