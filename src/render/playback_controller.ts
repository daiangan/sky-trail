/**
 * Animation playback state: reveal progress, points-per-second, isPlaying.
 *
 * Mirrors the Python project's `dome_view.advance / reset_animation`:
 *   - `tick(dt)` advances revealProgress by `dt * pointsPerSecond` while
 *     the animation is playing and we haven't already reached the end.
 *   - When revealCount reaches the timeline length, the controller
 *     auto-pauses -- "Playback pauses automatically once the end of
 *     the timeline is reached" (section 3.7 of the migration prompt).
 *   - `reset()` zeros reveal progress and pauses, without touching
 *     configuration (pointsPerSecond, point size, camera rotation).
 */

export interface PlaybackSnapshot {
  revealProgress: number;
  revealCount: number;
  timelineLength: number;
  pointsPerSecond: number;
  isPlaying: boolean;
  isFinished: boolean;
}

export interface PlaybackListener {
  (snapshot: PlaybackSnapshot): void;
}

export class PlaybackController {
  private revealProgress = 0;
  private revealCount = 0;
  private timelineLength = 0;
  private pointsPerSecond = 5.0;
  private isPlaying = false;
  private listeners = new Set<PlaybackListener>();

  setPointsPerSecond(value: number): void {
    this.pointsPerSecond = Math.max(0, value);
    this.notify();
  }

  getPointsPerSecond(): number {
    return this.pointsPerSecond;
  }

  setTimelineLength(length: number): void {
    this.timelineLength = Math.max(0, length);
    this.revealProgress = 0;
    this.revealCount = 0;
    this.isPlaying = false;
    this.notify();
  }

  /** Advance the animation by `dt` seconds. Auto-pauses at the end. */
  tick(dt: number): void {
    if (!this.isPlaying || this.pointsPerSecond <= 0) return;
    if (this.revealCount >= this.timelineLength) {
      this.isPlaying = false;
      this.notify();
      return;
    }
    this.revealProgress += dt * this.pointsPerSecond;
    const target = Math.floor(this.revealProgress);
    if (target !== this.revealCount) {
      this.revealCount = Math.min(target, this.timelineLength);
      this.notify();
    }
    if (this.revealCount >= this.timelineLength) {
      this.isPlaying = false;
      this.notify();
    }
  }

  play(): void {
    if (this.timelineLength === 0) return;
    if (this.revealCount >= this.timelineLength) {
      this.revealProgress = 0;
      this.revealCount = 0;
    }
    this.isPlaying = true;
    this.notify();
  }

  pause(): void {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.notify();
    }
  }

  togglePlay(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  reset(): void {
    this.revealProgress = 0;
    this.revealCount = 0;
    this.isPlaying = false;
    this.notify();
  }

  snapshot(): PlaybackSnapshot {
    return {
      revealProgress: this.revealProgress,
      revealCount: this.revealCount,
      timelineLength: this.timelineLength,
      pointsPerSecond: this.pointsPerSecond,
      isPlaying: this.isPlaying,
      isFinished: this.revealCount >= this.timelineLength,
    };
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
