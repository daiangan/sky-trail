/**
 * Export dialog, in three steps: choose the shape and quality of the video,
 * watch the progress (bar + percentage + phase label, with a Cancel button),
 * and, on success, Download + Close buttons that stay visible until the user
 * dismisses the dialog. The dialog used to close automatically on success,
 * which meant users missed the "Download" affordance.
 */

import { clear, el } from './dom';
import {
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_QUALITY,
  EXPORT_FORMATS,
  EXPORT_QUALITIES,
  exportSize,
  findFormat,
  formatExportDuration,
  overlayScale,
  type ExportFormatId,
  type ExportQualityId,
} from '../export/export_formats';
import type {
  VideoExporter,
  VideoExportOptions,
  VideoExportProgress,
  VideoExportResult,
} from '../export/video_exporter';

export interface ExportDialogApi {
  open: (
    exporter: VideoExporter,
    options?: VideoExportOptions,
  ) => Promise<VideoExportResult | null>;
}

type Stage = 'settings' | 'running' | 'done';

const STORAGE_KEY = 'skyTrail.exportChoice.v1';

function loadChoice(): { format: ExportFormatId; quality: ExportQualityId } {
  const fallback = { format: DEFAULT_EXPORT_FORMAT, quality: DEFAULT_EXPORT_QUALITY };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      format?: string;
      quality?: string;
    } | null;
    const format = EXPORT_FORMATS.find((f) => f.id === raw?.format)?.id;
    const quality = EXPORT_QUALITIES.find((q) => q.id === raw?.quality)?.id;
    return { format: format ?? fallback.format, quality: quality ?? fallback.quality };
  } catch {
    return fallback;
  }
}

function saveChoice(choice: { format: ExportFormatId; quality: ExportQualityId }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // private browsing or quota: the choice is just not remembered
  }
}

export function mountExportDialog(root: HTMLElement): ExportDialogApi {
  clear(root);
  root.classList.add('dialog-root', 'export-dialog-root');

  const SETTINGS_SUBTITLE = 'Pick the shape of the video. The whole dome always stays in frame.';
  const RUNNING_SUBTITLE =
    'Capturing the dome + overlay at 30 fps. Runs in real time at your configured arc speed.';

  const title = el('h2', { class: 'dialog__title', id: 'export-title' }, ['Export to Video']);
  const subtitle = el('p', { class: 'dialog__subtitle' }, [SETTINGS_SUBTITLE]);

  // --- step 1: shape and quality ---------------------------------------
  let choice = loadChoice();
  let activeExporter: VideoExporter | null = null;
  let activeOptions: VideoExportOptions = {};

  const formatInputs = new Map<ExportFormatId, HTMLInputElement>();
  const formatCards = EXPORT_FORMATS.map((format) => {
    const input = el('input', {
      type: 'radio',
      name: 'export-format',
      value: format.id,
      class: 'export-format__input',
    }) as HTMLInputElement;
    formatInputs.set(format.id, input);
    input.addEventListener('change', () => {
      choice = { ...choice, format: format.id };
      refreshSummary();
    });
    // The glyph is a small box in the chosen shape; the window shape is drawn dashed.
    const glyph = el('span', { class: 'export-format__glyph', 'aria-hidden': 'true' });
    glyph.style.aspectRatio = String(format.aspect ?? 4 / 3);
    if (format.aspect === null) glyph.classList.add('export-format__glyph--window');
    return el('label', { class: 'export-format' }, [
      input,
      glyph,
      el('span', { class: 'export-format__label' }, [format.label]),
      el('span', { class: 'export-format__hint' }, [format.hint]),
    ]);
  });
  const formatGroup = el('fieldset', { class: 'export-group' }, [
    el('legend', { class: 'export-group__legend' }, ['Format']),
    el('div', { class: 'export-formats' }, formatCards),
  ]);

  const qualityInputs = new Map<ExportQualityId, HTMLInputElement>();
  const qualityOptions = EXPORT_QUALITIES.map((quality) => {
    const input = el('input', {
      type: 'radio',
      name: 'export-quality',
      value: quality.id,
      class: 'export-quality__input',
    }) as HTMLInputElement;
    qualityInputs.set(quality.id, input);
    input.addEventListener('change', () => {
      choice = { ...choice, quality: quality.id };
      refreshSummary();
    });
    return el('label', { class: 'export-quality' }, [
      input,
      el('span', { class: 'export-quality__label' }, [quality.label]),
      el('span', { class: 'export-quality__hint' }, [quality.hint]),
    ]);
  });
  const qualityGroup = el('fieldset', { class: 'export-group' }, [
    el('legend', { class: 'export-group__legend' }, ['Quality']),
    el('div', { class: 'export-qualities' }, qualityOptions),
  ]);

  const summary = el('p', { class: 'export-summary', id: 'export-summary' });
  const startBtn = el('button', { class: 'btn btn--primary', type: 'button', id: 'export-start' }, [
    'Start export',
  ]);
  const settingsCancelBtn = el('button', { class: 'btn', type: 'button', id: 'export-back' }, [
    'Cancel',
  ]);
  const settingsButtons = el('div', { class: 'dialog__buttons' }, [settingsCancelBtn, startBtn]);
  const settingsPane = el('div', { class: 'export-settings' }, [
    formatGroup,
    qualityGroup,
    summary,
    settingsButtons,
  ]);

  function refreshSummary(): void {
    for (const [id, input] of formatInputs) input.checked = id === choice.format;
    for (const [id, input] of qualityInputs) input.checked = id === choice.quality;
    const isWindow = findFormat(choice.format).aspect === null;
    for (const input of qualityInputs.values()) input.disabled = isWindow;
    qualityGroup.classList.toggle('export-group--disabled', isWindow);
    if (!activeExporter) return;
    const size = exportSize(choice.format, choice.quality, activeExporter.windowSize());
    const seconds = formatExportDuration(activeExporter.estimateSeconds());
    summary.textContent = `${size.width} × ${size.height} px · 30 fps · about ${seconds}, recorded in real time.`;
  }

  function showStage(next: Stage): void {
    stage = next;
    settingsPane.style.display = next === 'settings' ? '' : 'none';
    const running = next !== 'settings';
    progressBar.style.display = running ? '' : 'none';
    progressText.style.display = running ? '' : 'none';
    buttons.style.display = running ? '' : 'none';
    subtitle.textContent = running ? RUNNING_SUBTITLE : SETTINGS_SUBTITLE;
  }
  let stage: Stage = 'settings';
  const progressBar = el('div', { class: 'export-progress__bar' }, [
    el('div', { class: 'export-progress__fill', id: 'export-fill' }),
  ]);
  const progressText = el('p', { class: 'export-progress__text', id: 'export-text' }, [
    'Preparing…',
  ]);
  const errorText = el('p', { class: 'dialog__error', id: 'export-error' });
  const cancelBtn = el('button', { class: 'btn', type: 'button', id: 'export-cancel' }, ['Cancel']);
  const downloadBtn = el(
    'button',
    { class: 'btn btn--primary', type: 'button', id: 'export-download' },
    ['Download'],
  );
  const closeBtn = el('button', { class: 'btn', type: 'button', id: 'export-close' }, ['Close']);
  downloadBtn.style.display = 'none';
  closeBtn.style.display = 'none';

  let currentHandle: { cancel: () => void } | null = null;
  let currentResult: VideoExportResult | null = null;
  let currentResolve: ((value: VideoExportResult | null) => void) | null = null;

  cancelBtn.addEventListener('click', () => {
    currentHandle?.cancel();
  });
  settingsCancelBtn.addEventListener('click', () => close());
  startBtn.addEventListener('click', () => startExport());

  downloadBtn.addEventListener('click', () => {
    if (!currentResult) return;
    triggerDownload(currentResult);
    close();
  });

  closeBtn.addEventListener('click', () => {
    close();
  });

  function close(): void {
    root.classList.remove('dialog-root--open');
    if (currentResolve) {
      currentResolve(currentResult);
      currentResolve = null;
    }
  }

  const buttons = el('div', { class: 'dialog__buttons' }, [cancelBtn, downloadBtn, closeBtn]);
  const dialog = el(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title' },
    [title, subtitle, settingsPane, progressBar, progressText, errorText, buttons],
  );

  const backdrop = el('div', { class: 'dialog__backdrop' }, [dialog]);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  root.appendChild(backdrop);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('dialog-root--open')) dismiss();
  });

  /** Escape or a click outside: closes the dialog, or cancels an export in progress. */
  function dismiss(): void {
    if (stage === 'running') currentHandle?.cancel();
    else close();
  }

  function applyProgress(progress: VideoExportProgress): void {
    const ratio = progress.totalFrames > 0 ? progress.frame / progress.totalFrames : 0;
    setFill(ratio);
    progressText.textContent = formatProgress(progress);
  }

  function resetUi(): void {
    errorText.textContent = '';
    downloadBtn.style.display = 'none';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = '';
    progressText.textContent = 'Preparing…';
    setFill(0);
  }

  function startExport(): void {
    const exporter = activeExporter;
    if (!exporter) return;
    saveChoice(choice);
    const size = exportSize(choice.format, choice.quality, exporter.windowSize());
    const clientWidth = exporter.windowClientWidth();
    resetUi();
    showStage('running');

    const handle = exporter.start({
      ...activeOptions,
      width: size.width,
      height: size.height,
      overlayScale: overlayScale(choice.format, size, clientWidth),
      onProgress: applyProgress,
    });
    currentHandle = handle;

    handle.promise
      .then((result) => {
        currentResult = result;
        currentHandle = null;
        showStage('done');
        cancelBtn.style.display = 'none';
        downloadBtn.style.display = '';
        closeBtn.style.display = '';
        setFill(1);
        progressText.textContent = `Done — ${result.width}×${result.height} @ ${result.fps} fps (${result.durationSeconds.toFixed(1)}s)`;
      })
      .catch((err: unknown) => {
        currentResult = null;
        currentHandle = null;
        showStage('done');
        cancelBtn.style.display = 'none';
        closeBtn.style.display = '';
        const message = err instanceof Error ? err.message : String(err);
        const cancelled = message === 'Export cancelled';
        progressText.textContent = cancelled ? 'Export cancelled.' : 'Export failed.';
        errorText.textContent = cancelled ? '' : message;
      });
  }

  return {
    open: (exporter: VideoExporter, options: VideoExportOptions = {}) =>
      new Promise((resolve) => {
        currentResolve = resolve;
        currentResult = null;
        currentHandle = null;
        activeExporter = exporter;
        activeOptions = options;
        choice = loadChoice();
        resetUi();
        showStage('settings');
        refreshSummary();
        root.classList.add('dialog-root--open');
        (formatInputs.get(choice.format) ?? startBtn).focus();
      }),
  };
}

function setFill(ratio: number): void {
  const fill = document.getElementById('export-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
}

function formatProgress(progress: VideoExportProgress): string {
  const ratio = progress.totalFrames > 0 ? progress.frame / progress.totalFrames : 0;
  const pct = Math.round(ratio * 100);
  const phaseLabel = phaseText(progress.phase);
  return `${phaseLabel} — ${pct}% (frame ${progress.frame}/${progress.totalFrames}, ${progress.secondsElapsed.toFixed(1)}s / ${progress.secondsTotal.toFixed(1)}s)`;
}

function phaseText(phase: VideoExportProgress['phase']): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing';
    case 'rendering':
      return 'Rendering';
    case 'final-hold':
      return 'Holding final frame';
    case 'finalizing':
      return 'Finalizing';
  }
}

function triggerDownload(result: VideoExportResult): void {
  const a = document.createElement('a');
  a.href = result.url;
  const ext = result.blob.type.includes('mp4') ? 'mp4' : 'webm';
  a.download = `sky-trail-export-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
