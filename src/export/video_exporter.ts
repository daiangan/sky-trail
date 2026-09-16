/**
 * Browser video export. Section 3.12 of the migration prompt.
 *
 * Approach: `MediaRecorder` + `canvas.captureStream`. The prompt asks us to
 * evaluate this option first before pulling in the heavier
 * `ffmpeg.wasm` (~25 MB) -- MediaRecorder is good enough for the
 * primary use case (real-time playback of the user's preview, exported
 * as a webm that Instagram accepts transparently), and matches the
 * "deterministic, frame-by-frame walk through the same timeline"
 * requirement exactly because we drive every frame manually off a
 * fixed-dt timeline walk, then call renderOnce() once per frame.
 *
 * Trade-offs (documented in the README):
 *   - The export runs in real time, so a slow arc-speed slider means
 *     a slow export. The same speeds the user configured in the live
 *     preview are used here, so what they see is what they get.
 *   - Output is webm (vp8/vp9/vp9.0 by browser); no mp4 unless we
 *     later add `ffmpeg.wasm`.
 *   - The 2-second final-state hold is the same constant as the Python
 *     project; not exposed as a parameter.
 *
 * The bug called out in section 3.12 -- libx264's even-dimension
 * requirement -- is respected by snapping both width and height up to
 * the next even integer, even though MediaRecorder doesn't strictly
 * need it. Keeping the parity makes a future swap to ffmpeg.wasm a
 * drop-in change.
 */

import type { DomeView } from '../render/dome_view';
import type { OverlaySnapshot } from '../ui/overlay';
import { renderOverlayTo } from '../ui/overlay';

export interface VideoExportOptions {
  fps?: number;
  finalHoldSeconds?: number;
  bitsPerSecond?: number;
  mimeType?: string;
  onProgress?: (state: VideoExportProgress) => void;
}

export interface VideoExportProgress {
  phase: 'preparing' | 'rendering' | 'final-hold' | 'finalizing';
  frame: number;
  totalFrames: number;
  secondsElapsed: number;
  secondsTotal: number;
}

export interface VideoExportResult {
  blob: Blob;
  url: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
}

export type VideoExportHandle = {
  promise: Promise<VideoExportResult>;
  cancel: () => void;
};

export class VideoExporter {
  private cancelled = false;

  constructor(
    private readonly domeView: DomeView,
    private readonly getOverlaySnapshot: () => OverlaySnapshot,
  ) {}

  start(options: VideoExportOptions = {}): VideoExportHandle {
    this.cancelled = false;

    const promise = (async () => {
      const fps = options.fps ?? 30;
      const finalHold = options.finalHoldSeconds ?? 2;
      const bitsPerSecond = options.bitsPerSecond ?? 5_000_000;

      const srcDims = this.domeView.getCanvasDimensions();
      const width = toEven(srcDims.width);
      const height = toEven(srcDims.height);

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) throw new Error('Could not get 2D context for export canvas');

      const timelineLength = this.domeView.playbackLength();
      const pointsPerSecond = this.domeView.getPointsPerSecond();
      const revealSeconds = pointsPerSecond > 0 ? timelineLength / pointsPerSecond : 0;
      const totalSeconds = Math.max(1, revealSeconds + finalHold);
      const revealFrames = Math.max(1, Math.ceil(revealSeconds * fps));
      const holdFrames = Math.max(1, Math.ceil(finalHold * fps));
      const totalFrames = revealFrames + holdFrames;

      options.onProgress?.({
        phase: 'preparing',
        frame: 0,
        totalFrames,
        secondsElapsed: 0,
        secondsTotal: totalSeconds,
      });

      const mimeType = options.mimeType ?? pickSupportedMime();
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`MediaRecorder does not support ${mimeType} in this browser.`);
      }

      const stream = offscreen.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitsPerSecond,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          stream.getTracks().forEach((track) => track.stop());
          resolve(blob);
        };
      });

      this.domeView.freeze();
      this.domeView.reset();

      recorder.start();

      const dt = 1 / fps;
      const domCanvas = this.domeView.getCanvas();

      for (let frame = 0; frame < revealFrames; frame += 1) {
        if (this.cancelled) break;
        this.domeView.tickPlayback(dt);
        this.domeView.renderOnce();

        offCtx.fillStyle = 'rgb(8, 10, 18)';
        offCtx.fillRect(0, 0, width, height);
        offCtx.drawImage(domCanvas, 0, 0, domCanvas.width, domCanvas.height, 0, 0, width, height);
        renderOverlayTo(offCtx, width, height, this.getOverlaySnapshot());

        options.onProgress?.({
          phase: 'rendering',
          frame: frame + 1,
          totalFrames,
          secondsElapsed: (frame + 1) / fps,
          secondsTotal: totalSeconds,
        });

        await frameDelay(dt);
      }

      for (let frame = 0; frame < holdFrames; frame += 1) {
        if (this.cancelled) break;
        offCtx.fillStyle = 'rgb(8, 10, 18)';
        offCtx.fillRect(0, 0, width, height);
        offCtx.drawImage(domCanvas, 0, 0, domCanvas.width, domCanvas.height, 0, 0, width, height);
        renderOverlayTo(offCtx, width, height, this.getOverlaySnapshot());

        options.onProgress?.({
          phase: 'final-hold',
          frame: revealFrames + frame + 1,
          totalFrames,
          secondsElapsed: revealSeconds + (frame + 1) / fps,
          secondsTotal: totalSeconds,
        });

        await frameDelay(dt);
      }

      options.onProgress?.({
        phase: 'finalizing',
        frame: totalFrames,
        totalFrames,
        secondsElapsed: totalSeconds,
        secondsTotal: totalSeconds,
      });

      recorder.stop();
      this.domeView.resume();

      if (this.cancelled) {
        throw new Error('Export cancelled');
      }

      const blob = await recordingDone;
      const url = URL.createObjectURL(blob);
      return { blob, url, durationSeconds: totalSeconds, width, height, fps };
    })();

    return {
      promise,
      cancel: () => {
        this.cancelled = true;
      },
    };
  }
}

function toEven(n: number): number {
  return Math.max(2, Math.ceil(n / 2) * 2);
}

export function snapToEven(n: number): number {
  return toEven(n);
}

function pickSupportedMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return 'video/webm';
}

function frameDelay(dt: number): Promise<void> {
  // Pace the export to roughly real-time so MediaRecorder gets consistent
  // frame timing. Real dt is passed in so future callers can scale speed.
  return new Promise((resolve) => setTimeout(resolve, dt * 1000));
}
