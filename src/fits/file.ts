/**
 * DOM-touching layer: reads only the leading 5760 bytes of a FITS file
 * (the first two 2880-byte blocks, well past where any normal light-frame
 * header ends) and returns the structured metadata. Pixel data is never
 * loaded -- for a 23 MB light frame this keeps the work to a tiny slice
 * of the total bytes.
 */

import { extractLightMetadata, type LightFileInfo } from './extract';
import { parseFitsHeader } from './header';

const HEADER_BYTE_CAP = 5760;

export async function readLightBlob(blob: Blob): Promise<LightFileInfo> {
  const headerBytes = await readHeaderBytes(blob);
  const header = parseFitsHeader(headerBytes);
  const metadata = extractLightMetadata(header);
  return { ...metadata, sizeBytes: blob.size };
}

async function readHeaderBytes(blob: Blob): Promise<Uint8Array> {
  const slice = blob.slice(0, HEADER_BYTE_CAP, blob.type);
  return new Uint8Array(await slice.arrayBuffer());
}
