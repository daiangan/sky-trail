/**
 * Export progress dialog. Shows a bar + percentage + phase label,
 * a Cancel button while the export is running, and (on success)
 * Download + Close buttons that stay visible until the user
 * explicitly dismisses the dialog. The dialog used to close
 * automatically on success, which meant users missed the
 * "Download" affordance.
 */

import { clear, el } from './dom';
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

export function mountExportDialog(root: HTMLElement): ExportDialogApi {
  clear(root);
  root.classList.add('dialog-root', 'export-dialog-root');

  const title = el('h2', { class: 'dialog__title', id: 'export-title' }, ['Export to Video']);
  const subtitle = el('p', { class: 'dialog__subtitle' }, [
    'Capturing the dome + overlay at 30 fps. Runs in real time at your configured arc speed.',
  ]);
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
    [title, subtitle, progressBar, progressText, errorText, buttons],
  );

  const backdrop = el('div', { class: 'dialog__backdrop' }, [dialog]);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      if (currentResult || cancelBtn.style.display === 'none') close();
      else currentHandle?.cancel();
    }
  });
  root.appendChild(backdrop);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('dialog-root--open')) {
      if (currentResult || cancelBtn.style.display === 'none') close();
      else currentHandle?.cancel();
    }
  });

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

  return {
    open: (exporter: VideoExporter, options: VideoExportOptions = {}) =>
      new Promise((resolve) => {
        currentResolve = resolve;
        currentResult = null;
        currentHandle = null;
        resetUi();
        root.classList.add('dialog-root--open');

        const handle = exporter.start({ ...options, onProgress: applyProgress });
        currentHandle = handle;

        handle.promise
          .then((result) => {
            currentResult = result;
            currentHandle = null;
            cancelBtn.style.display = 'none';
            downloadBtn.style.display = '';
            closeBtn.style.display = '';
            setFill(1);
            progressText.textContent = `Done — ${result.width}×${result.height} @ ${result.fps} fps (${result.durationSeconds.toFixed(1)}s)`;
          })
          .catch((err: unknown) => {
            currentResult = null;
            currentHandle = null;
            cancelBtn.style.display = 'none';
            closeBtn.style.display = '';
            progressText.textContent = 'Export failed.';
            errorText.textContent = err instanceof Error ? err.message : String(err);
          });
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
