/**
 * Browser-side file reading: a single async iterator that yields
 * `LightFileInfo` for every FITS file the user hands us.
 *
 * Per the migration prompt, we prefer the File System Access API
 * (showDirectoryPicker / showOpenFilePicker) and fall back to
 * `<input type="file" webkitdirectory>` for browsers without support
 * (Safari, older Firefox).
 *
 * The header-only read in `fits/file.ts` keeps each call to a few KB
 * regardless of pixel data size, so iterating through hundreds of
 * 20-MB light frames stays well under any practical memory budget.
 */

import type { LightFileInfo } from '../fits';
import { readLightBlob } from '../fits';
import { abortError, mapConcurrent } from '../util/pool';

const FITS_EXTENSIONS = ['.fit', '.fits', '.fts'] as const;

/** Files opened at once: enough to hide per-file latency, few enough not to flood slow disks. */
const READ_CONCURRENCY = 12;
/** Folders nested deeper than this are ignored, which also stops runaway links. */
const MAX_FOLDER_DEPTH = 8;

export interface FilePickOptions {
  multiple?: boolean;
}

export interface ScanOptions {
  signal?: AbortSignal;
  /** Reports how many FITS files have been found so far while a folder is being listed. */
  onScan?: (found: number) => void;
}

export interface FileSource {
  files: File[];
}

/**
 * A FITS file worth reading: right extension, and not one of the hidden
 * companions macOS writes next to every file on some drives (`._Light_001.fits`).
 */
export function isReadableFits(name: string): boolean {
  const base = name.slice(name.lastIndexOf('/') + 1);
  return hasFitsExtension(base) && !base.startsWith('.');
}

export async function pickFiles(options: FilePickOptions = {}): Promise<FileSource | null> {
  const picker = (
    globalThis as { showOpenFilePicker?: (...args: unknown[]) => Promise<FileSystemFileHandle[]> }
  ).showOpenFilePicker;
  if (typeof picker === 'function') {
    try {
      const handles = await picker({
        multiple: options.multiple ?? true,
        types: [
          {
            description: 'FITS light frames',
            accept: {
              'application/fits': FITS_EXTENSIONS.map((ext) => ext.slice(1)) as unknown as string[],
            },
          },
        ],
      } as never);
      const files = await mapConcurrent(handles, READ_CONCURRENCY, (h) => h.getFile());
      return { files: files.filter((f) => isReadableFits(f.name)) };
    } catch (err) {
      if (isUserCancelled(err)) return null;
      throw err;
    }
  }
  return pickViaInput({ multiple: options.multiple ?? true, accept: FITS_EXTENSIONS });
}

export async function pickDirectory(options: ScanOptions = {}): Promise<FileSource | null> {
  const picker = (
    globalThis as {
      showDirectoryPicker?: (...args: unknown[]) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({ mode: 'read' } as never);
      const found: FileSystemFileHandle[] = [];
      await listDirectory(handle, found, 0, options);
      const files = await mapConcurrent(found, READ_CONCURRENCY, (h) => h.getFile(), {
        signal: options.signal,
      });
      return { files };
    } catch (err) {
      // A cancel from the progress bar is ours to report; a cancelled picker is not an error.
      if (!options.signal?.aborted && isUserCancelled(err)) return null;
      throw err;
    }
  }
  return pickViaInput({ multiple: true, accept: FITS_EXTENSIONS, directory: true });
}

/** Collects the FITS file handles of a folder and, recursively, of its subfolders. */
async function listDirectory(
  directory: FileSystemDirectoryHandle,
  found: FileSystemFileHandle[],
  depth: number,
  options: ScanOptions,
): Promise<void> {
  const iterable = directory as unknown as {
    entries(): AsyncIterable<[string, FileSystemHandle]>;
  };
  for await (const [name, entry] of iterable.entries()) {
    if (options.signal?.aborted) throw abortError();
    if (entry.kind === 'file') {
      if (isReadableFits(name)) {
        found.push(entry as FileSystemFileHandle);
        options.onScan?.(found.length);
      }
    } else if (depth < MAX_FOLDER_DEPTH && !name.startsWith('.')) {
      await listDirectory(entry as FileSystemDirectoryHandle, found, depth + 1, options);
    }
  }
}

interface InputPickOptions {
  multiple: boolean;
  accept: readonly string[];
  directory?: boolean;
}

function pickViaInput(options: InputPickOptions): Promise<FileSource | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple;
    input.accept = options.accept.join(',');
    if (options.directory) {
      (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
    }
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []).filter((f) => isReadableFits(f.name));
      cleanup();
      resolve({ files });
    });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    try {
      input.click();
    } catch (err) {
      cleanup();
      if (isUserCancelled(err)) resolve(null);
      else reject(err);
    }
  });
}

export function hasFitsExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return FITS_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isUserCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'NotAllowedError';
}

export interface ReadBatchOptions {
  /** `current` counts files finished so far; `currentFile` is the one that just finished. */
  onProgress?: (current: number, total: number, currentFile: string) => void;
  signal?: AbortSignal;
}

/** Reads the headers of all `files`, several at a time; results keep the order of `files`. */
export function readLightBatches(
  files: readonly File[],
  options: ReadBatchOptions = {},
): Promise<LightFileInfo[]> {
  const total = files.length;
  return mapConcurrent(files, READ_CONCURRENCY, (file) => readLightBlob(file), {
    signal: options.signal,
    onItemDone: (done, index) => options.onProgress?.(done, total, files[index]!.name),
  });
}
