/**
 * Integration test against a real FITS light frame. Skipped automatically
 * when the sample file isn't present (CI never has it). Override the
 * path with the SKY_TRAIL_SAMPLE env var.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { extractLightMetadata } from '../../src/fits/extract';
import { parseFitsHeader } from '../../src/fits/header';

const DEFAULT_PATH = resolve(
  process.cwd(),
  '../lights_samples/01/2026-09-15_02-21-38_6122_0.10_240.00s_0000.fits',
);
const samplePath = process.env['SKY_TRAIL_SAMPLE'] ?? DEFAULT_PATH;

const maybeDescribe = existsSync(samplePath) ? describe : describe.skip;

maybeDescribe('real FITS sample (lights_samples/01)', () => {
  it('parses the Siril/SVBony capture header end-to-end', async () => {
    const buf = await readFile(samplePath);
    const slice = buf.subarray(0, 5760);
    const header = parseFitsHeader(slice);
    const meta = extractLightMetadata(header);

    expect(meta.dateObs).toBe('2026-09-15T06:21:38.8822612');
    expect(meta.exptime).toBe(240.0);
    expect(meta.filterName).toBe('SV220');
    expect(meta.objRaDeg).toBeCloseTo(38.6417, 3);
    expect(meta.objDecDeg).toBeCloseTo(61.2681, 3);
    expect(meta.siteLatDeg).toBeCloseTo(18.5144, 4);
    expect(meta.siteLonDeg).toBeCloseTo(-69.9781, 4);
    expect(buf.byteLength).toBeGreaterThan(20_000_000);
  });
});

const sample02Path = resolve(
  process.cwd(),
  '../lights_samples/02/2026-09-15_02-00-00_6122_0.10_240.00s_0000.fits',
);
const maybeDescribe02 = existsSync(sample02Path) ? describe : describe.skip;

maybeDescribe02('header-only FITS samples (lights_samples/02)', () => {
  it('parses header-only FITS frame with zero data payload', async () => {
    const buf = await readFile(sample02Path);
    expect(buf.byteLength).toBe(2880);

    const header = parseFitsHeader(buf);
    const meta = extractLightMetadata(header);

    expect(meta.dateObs).toBe('2026-09-15T06:00:00.000');
    expect(meta.exptime).toBe(240);
    expect(meta.filterName).toBe('SV220');
    expect(meta.objRaDeg).toBeCloseTo(38.6417, 3);
    expect(meta.objDecDeg).toBeCloseTo(61.2681, 3);
    expect(meta.siteLatDeg).toBeCloseTo(18.5144, 4);
    expect(meta.siteLonDeg).toBeCloseTo(-69.9781, 4);
  });
});
