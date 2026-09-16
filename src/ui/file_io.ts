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

const FITS_EXTENSIONS = ['.fit', '.fits', '.fts'] as const;

export interface FilePickOptions {
  multiple?: boolean;
}

export interface FileSource {
  files: File[];
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
      const files = await Promise.all(handles.map((h) => h.getFile()));
      return { files };
    } catch (err) {
      if (isUserCancelled(err)) return null;
      throw err;
    }
  }
  return pickViaInput({ multiple: options.multiple ?? true, accept: FITS_EXTENSIONS });
}

export async function pickDirectory(): Promise<FileSource | null> {
  const picker = (
    globalThis as {
      showDirectoryPicker?: (...args: unknown[]) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({ mode: 'read' } as never);
      const files: File[] = [];
      const iterable = handle as unknown as {
        entries(): AsyncIterable<[string, FileSystemHandle]>;
      };
      for await (const [name, entry] of iterable.entries()) {
        if (entry.kind === 'file' && hasFitsExtension(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          files.push(await fileHandle.getFile());
        }
      }
      return { files };
    } catch (err) {
      if (isUserCancelled(err)) return null;
      throw err;
    }
  }
  return pickViaInput({ multiple: true, accept: FITS_EXTENSIONS, directory: true });
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
      const files = Array.from(input.files ?? []).filter((f) => hasFitsExtension(f.name));
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
  onProgress?: (current: number, total: number, currentFile: string) => void;
}

export async function readLightBatches(
  files: readonly File[],
  options: ReadBatchOptions = {},
): Promise<LightFileInfo[]> {
  const total = files.length;
  const out: LightFileInfo[] = [];
  for (let i = 0; i < total; i += 1) {
    const file = files[i]!;
    options.onProgress?.(i + 1, total, file.name);
    out.push(await readLightBlob(file));
  }
  return out;
}
