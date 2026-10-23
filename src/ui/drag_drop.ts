/**
 * Canvas Drag & Drop and Empty State handler.
 *
 * Implements Section 5 requirement:
 * "Drag & drop of files/folders directly onto the central canvas as the
 * primary 'get started' affordance, with a file-picker button always
 * visible as an alternative."
 */

import { isReadableFits, type ScanOptions } from './file_io';
import { clear, el } from './dom';
import { loadFiles } from './ingest';
import type { AppState } from './session_panel';
import type { Store } from './store';
import { abortError, mapConcurrent } from '../util/pool';

export interface DragDropOptions {
  canvasArea: HTMLElement;
  store: Store<AppState>;
  onPickFolder?: () => void;
  onPickFiles?: () => void;
  onLoadDemo?: () => void;
}

export function setupDragAndDrop(options: DragDropOptions): () => void {
  const { canvasArea, store, onPickFolder, onPickFiles, onLoadDemo } = options;

  // Prevent default drag/drop on entire window so browser does not navigate away
  const preventWindowDefaults = (e: DragEvent) => {
    e.preventDefault();
  };
  window.addEventListener('dragover', preventWindowDefaults);
  window.addEventListener('drop', preventWindowDefaults);

  // Dropzone backdrop cue element
  const dropZoneOverlay = el('div', { class: 'canvas-dropzone' }, [
    el('div', { class: 'canvas-dropzone__card' }, [
      el('div', { class: 'canvas-dropzone__icon' }, ['✦']),
      el('h3', { class: 'canvas-dropzone__title' }, ['Drop FITS Lights Here']),
      el('p', { class: 'canvas-dropzone__subtitle' }, [
        'Release to import files into your capture session',
      ]),
    ]),
  ]);
  canvasArea.appendChild(dropZoneOverlay);

  // Empty state hero widget when 0 sessions or 0 lights
  const emptyStateHero = el('div', { class: 'canvas-empty-state' }, [
    el('div', { class: 'canvas-empty-state__card' }, [
      el('div', { class: 'canvas-empty-state__badge' }, ['SkyTrail']),
      el('h1', { class: 'canvas-empty-state__title' }, ['Visualize Your Capture Progress']),
      el('p', { class: 'canvas-empty-state__desc' }, [
        'Drag and drop your FITS light frames or folder directly here to generate the 3D sky dome animation. Files never leave your browser.',
      ]),
      el('p', { class: 'canvas-empty-state__hint' }, [
        'Works with FITS lights from N.I.N.A., ASIAIR, KStars/Ekos, SharpCap, Siril and more. Only the header is read: date, exposure, target and site.',
      ]),
      el('div', { class: 'canvas-empty-state__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', id: 'empty-pick-folder' }, [
          'Select Folder…',
        ]),
        el('button', { class: 'btn', type: 'button', id: 'empty-pick-files' }, ['Choose Files…']),
      ]),
      el('div', { class: 'canvas-empty-state__divider' }, ['or']),
      el(
        'button',
        { class: 'btn btn--outline btn--block', type: 'button', id: 'empty-load-demo' },
        ['✦ Try a demo — no files needed'],
      ),
    ]),
  ]);
  canvasArea.appendChild(emptyStateHero);

  const folderBtn = emptyStateHero.querySelector('#empty-pick-folder');
  if (folderBtn && onPickFolder) {
    folderBtn.addEventListener('click', onPickFolder);
  }
  const demoBtn = emptyStateHero.querySelector('#empty-load-demo');
  if (demoBtn && onLoadDemo) {
    demoBtn.addEventListener('click', onLoadDemo);
  }
  const filesBtn = emptyStateHero.querySelector('#empty-pick-files');
  if (filesBtn && onPickFiles) {
    filesBtn.addEventListener('click', onPickFiles);
  }

  // Update empty state visibility based on project
  const updateEmptyState = (state: AppState) => {
    const totalLights = state.project.sessions.reduce((acc, s) => acc + s.lights.length, 0);
    emptyStateHero.style.display = totalLights === 0 ? 'flex' : 'none';
    // Nothing to show yet: hide the HUD, chart and view controls behind the welcome card.
    canvasArea.classList.toggle('app-layout__canvas--empty', totalLights === 0);
  };
  updateEmptyState(store.get());
  const unsubscribe = store.subscribe(updateEmptyState);

  let dragCounter = 0;

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter += 1;
    if (dragCounter === 1) {
      dropZoneOverlay.classList.add('canvas-dropzone--active');
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      dropZoneOverlay.classList.remove('canvas-dropzone--active');
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    dragCounter = 0;
    dropZoneOverlay.classList.remove('canvas-dropzone--active');

    if (!e.dataTransfer) return;
    // The dropped items are only readable until the first await, so gathering starts right away.
    const dataTransfer = e.dataTransfer;
    await loadFiles(store, (options) => extractFilesFromDrop(dataTransfer, options));
  };

  canvasArea.addEventListener('dragenter', onDragEnter);
  canvasArea.addEventListener('dragover', onDragOver);
  canvasArea.addEventListener('dragleave', onDragLeave);
  canvasArea.addEventListener('drop', onDrop);

  return () => {
    unsubscribe();
    window.removeEventListener('dragover', preventWindowDefaults);
    window.removeEventListener('drop', preventWindowDefaults);
    canvasArea.removeEventListener('dragenter', onDragEnter);
    canvasArea.removeEventListener('dragover', onDragOver);
    canvasArea.removeEventListener('dragleave', onDragLeave);
    canvasArea.removeEventListener('drop', onDrop);
    clear(dropZoneOverlay);
    clear(emptyStateHero);
  };
}

const DROP_READ_CONCURRENCY = 12;
const MAX_FOLDER_DEPTH = 8;

/** Files and folders (with their subfolders) dropped onto the canvas, FITS files only. */
async function extractFilesFromDrop(
  dataTransfer: DataTransfer,
  options: Required<ScanOptions>,
): Promise<File[]> {
  const entries: FileSystemFileEntry[] = [];
  const looseFiles: File[] = [];

  const readAll = (reader: FileSystemDirectoryReader) =>
    new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    if (options.signal.aborted) throw abortError();
    if (entry.isFile) {
      if (isReadableFits(entry.name)) {
        entries.push(entry as FileSystemFileEntry);
        options.onScan(entries.length + looseFiles.length);
      }
    } else if (entry.isDirectory && depth <= MAX_FOLDER_DEPTH && !entry.name.startsWith('.')) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns the folder in chunks until it comes back empty.
      let children = await readAll(reader);
      while (children.length > 0) {
        for (const child of children) await walk(child, depth + 1);
        children = await readAll(reader);
      }
    }
  };

  // Entries must be taken from the items before any await: the browser
  // invalidates the drop data once the event handler yields.
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) {
      roots.push(entry);
      continue;
    }
    const file = item.getAsFile();
    if (file && isReadableFits(file.name)) looseFiles.push(file);
  }
  if (roots.length === 0 && looseFiles.length === 0) {
    for (const file of Array.from(dataTransfer.files ?? [])) {
      if (isReadableFits(file.name)) looseFiles.push(file);
    }
  }

  for (const root of roots) await walk(root, 0);
  const listed = await mapConcurrent(
    entries,
    DROP_READ_CONCURRENCY,
    (entry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject)),
    { signal: options.signal },
  );
  return [...looseFiles, ...listed];
}
