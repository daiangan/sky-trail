/**
 * Export progress dialog. Shows a bar + percentage + phase label, a
 * Cancel button that aborts the in-flight `VideoExportHandle`, and
 * (on success) a Download button that triggers a save-as for the
 * resulting blob.
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
  downloadBtn.style.display = 'none';

  let currentHandle: { cancel: () => void } | null = null;
  let currentResult: VideoExportResult | null = null;

  cancelBtn.addEventListener('click', () => {
    currentHandle?.cancel();
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentResult) return;
    triggerDownload(currentResult);
  });

  const buttons = el('div', { class: 'dialog__buttons' }, [cancelBtn, downloadBtn]);
  const dialog = el(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title' },
    [title, subtitle, progressBar, progressText, errorText, buttons],
  );

  const backdrop = el('div', { class: 'dialog__backdrop' }, [dialog]);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) currentHandle?.cancel();
  });
  root.appendChild(backdrop);

  function applyProgress(progress: VideoExportProgress): void {
    const ratio = progress.totalFrames > 0 ? progress.frame / progress.totalFrames : 0;
    setFill(ratio);
    progressText.textContent = formatProgress(progress);
  }

  return {
    open: async (exporter: VideoExporter, options: VideoExportOptions = {}) => {
      errorText.textContent = '';
      downloadBtn.style.display = 'none';
      cancelBtn.style.display = '';
      progressText.textContent = 'Preparing…';
      setFill(0);
      root.classList.add('dialog-root--open');

      const handle = exporter.start({ ...options, onProgress: applyProgress });
      currentHandle = handle;
      currentResult = null;

      try {
        const result = await handle.promise;
        currentResult = result;
        currentHandle = null;
        cancelBtn.style.display = 'none';
        downloadBtn.style.display = '';
        setFill(1);
        progressText.textContent = `Done — ${result.width}×${result.height} @ ${result.fps} fps (${result.durationSeconds.toFixed(1)}s)`;
        root.classList.remove('dialog-root--open');
        return result;
      } catch (err) {
        currentHandle = null;
        currentResult = null;
        cancelBtn.style.display = 'none';
        progressText.textContent = 'Export failed.';
        errorText.textContent = err instanceof Error ? err.message : String(err);
        root.classList.remove('dialog-root--open');
        return null;
      }
    },
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
