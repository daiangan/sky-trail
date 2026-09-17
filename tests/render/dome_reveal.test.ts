import { describe, expect, it } from 'vitest';
import { createProject, addSession, addLight, createSession } from '../../src/model';
import { buildTimeline } from '../../src/model/timeline';

describe('multi-session progressive reveal accounting', () => {
  it('accurately distributes revealed point counts across sessions', () => {
    let project = createProject('Multi-night target');
    let session1 = createSession(0, 'Night 1');
    let session2 = createSession(1, 'Night 2');

    // Add 3 lights to Night 1
    for (let i = 0; i < 3; i++) {
      session1 = addLight(session1, {
        path: `night1_frame_${i}.fits`,
        dateObs: `2026-05-01T21:0${i}:00Z`,
        exptime: 300,
        filterName: 'Ha',
        sizeBytes: 10_000_000,
        objRaDeg: 83.82,
        objDecDeg: -5.39,
        siteLatDeg: 40.0,
        siteLonDeg: -3.7,
        altDeg: 45 + i,
        azDeg: 120 + i,
      });
    }

    // Add 4 lights to Night 2
    for (let i = 0; i < 4; i++) {
      session2 = addLight(session2, {
        path: `night2_frame_${i}.fits`,
        dateObs: `2026-05-02T21:0${i}:00Z`,
        exptime: 300,
        filterName: 'Ha',
        sizeBytes: 10_000_000,
        objRaDeg: 83.82,
        objDecDeg: -5.39,
        siteLatDeg: 40.0,
        siteLonDeg: -3.7,
        altDeg: 50 + i,
        azDeg: 125 + i,
      });
    }

    project = addSession(project, session1);
    project = addSession(project, session2);

    const timeline = buildTimeline(project);
    expect(timeline).toHaveLength(7);

    // Test reveal calculation helper matching DomeView.updateRevealedPoints
    function getRevealedCounts(revealCount: number) {
      const clamped = Math.max(0, Math.min(revealCount, timeline.length));
      const counts = new Map<number, number>();
      for (let i = 0; i < clamped; i += 1) {
        const sIndex = timeline[i]!.nightIndex - 1;
        counts.set(sIndex, (counts.get(sIndex) ?? 0) + 1);
      }
      return {
        night1: counts.get(0) ?? 0,
        night2: counts.get(1) ?? 0,
      };
    }

    // When revealCount is 0
    expect(getRevealedCounts(0)).toEqual({ night1: 0, night2: 0 });

    // Partial night 1 (reveal 2 out of 3 points)
    expect(getRevealedCounts(2)).toEqual({ night1: 2, night2: 0 });

    // End of night 1 (3 points)
    expect(getRevealedCounts(3)).toEqual({ night1: 3, night2: 0 });

    // Into night 2 (4 points: 3 from night 1, 1 from night 2)
    expect(getRevealedCounts(4)).toEqual({ night1: 3, night2: 1 });

    // Complete timeline (7 points)
    expect(getRevealedCounts(7)).toEqual({ night1: 3, night2: 4 });
  });
});
