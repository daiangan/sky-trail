/**
 * Canvas Drag & Drop and Empty State handler.
 *
 * Implements Section 5 requirement:
 * "Drag & drop of files/folders directly onto the central canvas as the
 * primary 'get started' affordance, with a file-picker button always
 * visible as an alternative."
 */

import { hasFitsExtension, readLightBatches } from './file_io';
import { clear, el } from './dom';
import { addLight, createSession } from '../model/session';
import { addSession } from '../model/project';
import { lightFrameFromInfo, type AppState } from './session_panel';
import type { Store } from './store';

export interface DragDropOptions {
  canvasArea: HTMLElement;
  store: Store<AppState>;
  onPickFolder?: () => void;
  onPickFiles?: () => void;
}

export function setupDragAndDrop(options: DragDropOptions): () => void {
  const { canvasArea, store, onPickFolder, onPickFiles } = options;

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
      el('div', { class: 'canvas-empty-state__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', id: 'empty-pick-folder' }, [
          'Select Folder…',
        ]),
        el('button', { class: 'btn', type: 'button', id: 'empty-pick-files' }, ['Choose Files…']),
      ]),
    ]),
  ]);
  canvasArea.appendChild(emptyStateHero);

  const folderBtn = emptyStateHero.querySelector('#empty-pick-folder');
  if (folderBtn && onPickFolder) {
    folderBtn.addEventListener('click', onPickFolder);
  }
  const filesBtn = emptyStateHero.querySelector('#empty-pick-files');
  if (filesBtn && onPickFiles) {
    filesBtn.addEventListener('click', onPickFiles);
  }

  // Update empty state visibility based on project
  const updateEmptyState = (state: AppState) => {
    const totalLights = state.project.sessions.reduce((acc, s) => acc + s.lights.length, 0);
    emptyStateHero.style.display = totalLights === 0 ? 'flex' : 'none';
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
    const files = await extractFilesFromDrop(e.dataTransfer);
    if (files.length === 0) return;

    await ingestFiles(files, store);
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

export async function ingestFiles(files: File[], store: Store<AppState>): Promise<void> {
  const fitsFiles = files.filter((f) => hasFitsExtension(f.name));
  if (fitsFiles.length === 0) return;

  const infos = await readLightBatches(fitsFiles, {
    onProgress: (current, total, fileName) => {
      store.set((s) => ({ ...s, loading: { current, total, fileName } }));
    },
  });

  store.set((s) => {
    let project = s.project;
    let selectedId = s.selectedSessionId;

    // If there are no sessions, automatically create "Night 1"
    if (project.sessions.length === 0) {
      const newSession = createSession(0, 'Night 1');
      project = addSession(project, newSession);
      selectedId = 0;
    } else if (selectedId === null) {
      selectedId = project.sessions.length - 1;
    }

    const session = project.sessions[selectedId];
    if (!session) return s;

    let updatedSession = session;
    for (let i = 0; i < fitsFiles.length; i += 1) {
      updatedSession = addLight(updatedSession, lightFrameFromInfo(infos[i]!, fitsFiles[i]!.name));
    }

    const sessions = project.sessions.slice();
    sessions[selectedId] = updatedSession;
    project = { ...project, sessions };

    return {
      ...s,
      project,
      selectedSessionId: selectedId,
      loading: null,
    };
  });
}

async function extractFilesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const files: File[] = [];

  const traverse = async (entry: FileSystemEntry | null) => {
    if (!entry) return;
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      if (hasFitsExtension(file.name)) {
        files.push(file);
      }
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const readEntries = () =>
        new Promise<FileSystemEntry[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
      let entries = await readEntries();
      while (entries.length > 0) {
        for (const child of entries) {
          await traverse(child);
        }
        entries = await readEntries();
      }
    }
  };

  const promises: Promise<void>[] = [];
  for (const item of items) {
    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        promises.push(traverse(entry));
        continue;
      }
    }
    const file = item.getAsFile();
    if (file && hasFitsExtension(file.name)) {
      files.push(file);
    }
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  } else if (files.length === 0) {
    for (const f of Array.from(dataTransfer.files ?? [])) {
      if (hasFitsExtension(f.name)) {
        files.push(f);
      }
    }
  }

  return files;
}
