import { describe, expect, it } from 'vitest';
import { computeAltAz } from '../../src/astro/altaz';
import { nextMeridianTransit } from '../../src/astro/transit';

const HOUR = 3600 * 1000;

describe('nextMeridianTransit', () => {
  const cases = [
    { name: 'north, object south of zenith', lat: 35, lon: -105, raDeg: 325, decDeg: 4 },
    { name: 'northern high declination', lat: 52, lon: 13, raDeg: 83.8, decDeg: -5.4 },
    { name: 'southern hemisphere', lat: -30, lon: 70, raDeg: 201, decDeg: -43 },
    { name: 'east longitude', lat: 18.5, lon: 150, raDeg: 10, decDeg: 20 },
  ];

  for (const c of cases) {
    it(`puts the object at its highest point (${c.name})`, () => {
      const from = new Date(Date.UTC(2026, 7, 12));
      const transit = nextMeridianTransit(c.raDeg, c.lon, from);
      const observer = { latitudeDeg: c.lat, longitudeDeg: c.lon };
      const target = { raDeg: c.raDeg, decDeg: c.decDeg };

      const altitude = computeAltAz(transit, observer, target).altitudeDeg;
      expect(altitude).toBeCloseTo(90 - Math.abs(c.lat - c.decDeg), 0);
      // It is the maximum: the sky is lower both before and after.
      expect(
        computeAltAz(new Date(transit.getTime() - HOUR), observer, target).altitudeDeg,
      ).toBeLessThan(altitude);
      expect(
        computeAltAz(new Date(transit.getTime() + HOUR), observer, target).altitudeDeg,
      ).toBeLessThan(altitude);
    });
  }

  it('is never before `from` and never more than a sidereal day away', () => {
    const from = new Date(Date.UTC(2026, 0, 1, 15, 30));
    for (const raDeg of [0, 90, 180, 270, 359.9]) {
      const transit = nextMeridianTransit(raDeg, -70, from);
      expect(transit.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(transit.getTime() - from.getTime()).toBeLessThan(24 * HOUR);
    }
  });

  it('comes about 3 minutes 56 seconds earlier each day', () => {
    const day1 = nextMeridianTransit(325, -105, new Date(Date.UTC(2026, 7, 12)));
    const day2 = nextMeridianTransit(325, -105, new Date(Date.UTC(2026, 7, 13)));
    const shiftSeconds = (day1.getTime() + 24 * HOUR - day2.getTime()) / 1000;
    expect(shiftSeconds).toBeGreaterThan(230);
    expect(shiftSeconds).toBeLessThan(242);
  });
});
