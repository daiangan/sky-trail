import { describe, expect, it } from 'vitest';
import { PlaybackController } from '../../src/render/playback_controller';

describe('PlaybackController', () => {
  it('starts paused with revealProgress 0 and revealCount 0', () => {
    const pc = new PlaybackController();
    expect(pc.snapshot()).toMatchObject({
      revealProgress: 0,
      revealCount: 0,
      timelineLength: 0,
      pointsPerSecond: 5.0,
      isPlaying: false,
    });
  });

  it('does not advance when paused', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(10);
    pc.tick(1.0);
    expect(pc.snapshot().revealCount).toBe(0);
  });

  it('does not advance when timeline is empty', () => {
    const pc = new PlaybackController();
    pc.setPointsPerSecond(10);
    pc.play();
    pc.tick(1.0);
    expect(pc.snapshot().revealCount).toBe(0);
    expect(pc.snapshot().isPlaying).toBe(false);
  });

  it('advances revealProgress by dt * pointsPerSecond while playing', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(100);
    pc.setPointsPerSecond(5);
    pc.play();
    pc.tick(1.0);
    const snap = pc.snapshot();
    expect(snap.revealProgress).toBeCloseTo(5, 6);
    expect(snap.revealCount).toBe(5);
    expect(snap.isPlaying).toBe(true);
  });

  it('clamps revealCount to timelineLength and auto-pauses at the end', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(10);
    pc.setPointsPerSecond(5);
    pc.play();
    pc.tick(100);
    const snap = pc.snapshot();
    expect(snap.revealCount).toBe(10);
    expect(snap.revealProgress).toBeGreaterThanOrEqual(10);
    expect(snap.isPlaying).toBe(false);
    expect(snap.isFinished).toBe(true);
  });

  it('reset zeros progress and pauses, but keeps pointsPerSecond', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(10);
    pc.setPointsPerSecond(7);
    pc.play();
    pc.tick(1.0);
    pc.reset();
    const snap = pc.snapshot();
    expect(snap.revealProgress).toBe(0);
    expect(snap.revealCount).toBe(0);
    expect(snap.isPlaying).toBe(false);
    expect(snap.pointsPerSecond).toBe(7);
  });

  it('play after reaching the end restarts from 0', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(5);
    pc.setPointsPerSecond(5);
    pc.play();
    pc.tick(10);
    expect(pc.snapshot().isFinished).toBe(true);
    pc.play();
    expect(pc.snapshot().isPlaying).toBe(true);
    expect(pc.snapshot().revealCount).toBe(0);
  });

  it('setTimelineLength resets progress and pauses', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(10);
    pc.play();
    pc.tick(1.0);
    pc.setTimelineLength(20);
    const snap = pc.snapshot();
    expect(snap.revealCount).toBe(0);
    expect(snap.isPlaying).toBe(false);
    expect(snap.timelineLength).toBe(20);
  });

  it('setPointsPerSecond clamps to >= 0 and notifies listeners', () => {
    const pc = new PlaybackController();
    const calls: number[] = [];
    pc.subscribe((snap) => calls.push(snap.pointsPerSecond));
    pc.setPointsPerSecond(-5);
    expect(pc.snapshot().pointsPerSecond).toBe(0);
    pc.setPointsPerSecond(8);
    expect(pc.snapshot().pointsPerSecond).toBe(8);
    expect(calls).toEqual([0, 8]);
  });

  it('unsubscribe stops further notifications', () => {
    const pc = new PlaybackController();
    const calls: number[] = [];
    pc.setTimelineLength(10);
    pc.setPointsPerSecond(5);
    pc.play();
    const unsub = pc.subscribe((snap) => calls.push(snap.revealCount));
    pc.tick(1.0);
    const afterFirst = calls.length;
    unsub();
    pc.tick(1.0);
    pc.play();
    pc.pause();
    pc.reset();
    expect(calls.length).toBe(afterFirst);
  });

  it('togglePlay flips isPlaying', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(10);
    pc.togglePlay();
    expect(pc.snapshot().isPlaying).toBe(true);
    pc.togglePlay();
    expect(pc.snapshot().isPlaying).toBe(false);
  });

  it('advance unconditionally advances reveal progress even when paused', () => {
    const pc = new PlaybackController();
    pc.setTimelineLength(20);
    pc.setPointsPerSecond(5);
    expect(pc.snapshot().isPlaying).toBe(false);
    pc.advance(1.0);
    expect(pc.snapshot().revealCount).toBe(5);
    expect(pc.snapshot().isPlaying).toBe(false);
  });
});
