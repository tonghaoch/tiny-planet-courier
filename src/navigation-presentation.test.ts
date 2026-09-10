import { describe, expect, it } from 'vitest';
import { advanceNavigationHeading, arrivalActive } from './navigation-presentation';
import { DELIVERY_RADIUS, DELIVERY_HOLD, DELIVERY_SPEED, DeliveryRun } from './game';
import { Vector3 } from 'three';
import { PLANET_RADIUS, type Destination } from './math';

const radians = (degrees: number) => (degrees * Math.PI) / 180;

describe('displayed-angle animation', () => {
  it('retargets toward -20 from the actually displayed angle, not the old 170 endpoint', () => {
    let displayed = advanceNavigationHeading(0, radians(170), 0.06);
    expect(displayed).toBeGreaterThan(0);
    expect(displayed).toBeLessThan(radians(150));
    const interrupted = displayed;
    displayed = advanceNavigationHeading(displayed, radians(-20), 1 / 60);
    expect(displayed).toBeLessThan(interrupted);
    expect(displayed).toBeGreaterThan(radians(-20));
  });
  it('is frame-rate independent and settles large turns in 150ms', () => {
    const result = (hz: number) => {
      let angle = 0;
      for (let i = 0; i < hz; i++) angle = advanceNavigationHeading(angle, radians(170), 1 / hz);
      return angle;
    };
    expect(result(30)).toBeCloseTo(result(144), 10);
    expect(radians(170) - advanceNavigationHeading(0, radians(170), 0.15)).toBeLessThan(radians(9));
  });
  it('freezes with zero dt and snaps on reset or reduced motion', () => {
    expect(advanceNavigationHeading(1, -2, 0)).toBe(1);
    expect(advanceNavigationHeading(null, -2, 0)).toBe(-2);
    expect(advanceNavigationHeading(1, -2, 0.016, true)).toBe(-2);
  });
});

describe('arrival presentation does not widen delivery eligibility', () => {
  it('enters only inside the actual radius, exits with a quarter-unit tolerance, and requires ground', () => {
    expect(arrivalActive(false, DELIVERY_RADIUS, true)).toBe(false);
    expect(arrivalActive(false, DELIVERY_RADIUS - 0.001, true)).toBe(true);
    expect(arrivalActive(true, DELIVERY_RADIUS + 0.24, true)).toBe(true);
    expect(arrivalActive(true, DELIVERY_RADIUS + 0.25, true)).toBe(false);
    expect(arrivalActive(true, 0, false)).toBe(false);
  });
  it('keeps parking across the center and never makes the tolerance, speed or airborne state eligible', () => {
    const normal = new Vector3(0, 1, 0);
    const destination = { id: 'pad', normal } as Destination;
    const run = new DeliveryRun([destination]);
    run.start();
    let arrival = false;
    for (const offset of [-0.02, 0, 0.02]) arrival = arrivalActive(arrival, Math.abs(offset), true);
    expect(arrival).toBe(true);
    const outside = normal.clone().applyAxisAngle(new Vector3(1, 0, 0), (DELIVERY_RADIUS + 0.1) / PLANET_RADIUS);
    expect(run.update(DELIVERY_HOLD + 1, outside, 0)).toBeNull();
    expect(run.update(DELIVERY_HOLD + 1, normal, DELIVERY_SPEED)).toBeNull();
    expect(run.update(DELIVERY_HOLD + 1, normal, 0, 0, false)).toBeNull();
    expect(run.update(DELIVERY_HOLD + 1, normal, 0, 0.2)).toBeNull();
    expect(run.parkedFor).toBe(0);
    expect(run.update(DELIVERY_HOLD - 0.01, normal, 0)).toBeNull();
    expect(run.update(0.02, normal, 0)?.finished).toBe(true);
  });
});
