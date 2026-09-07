import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { advanceOnSphere, headingTo, PLANET_RADIUS, seededRandom, spherical, surfaceDistance, tangent } from './math';

describe('spherical movement', () => {
  it('maps degrees to unit surface directions', () => {
    expect(spherical(0, 0).distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-12);
    expect(spherical(90, 12).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
  });

  it('keeps the surface normal and heading normalized and perpendicular over long drives', () => {
    const normal = spherical(30, 0);
    const forward = new Vector3(1, 0, 0);
    for (let i = 0; i < 100000; i++) {
      forward.applyAxisAngle(normal, Math.sin(i * 0.003) * 0.007);
      advanceOnSphere(normal, forward, 0.03);
    }
    expect(normal.length()).toBeCloseTo(1, 10);
    expect(forward.length()).toBeCloseTo(1, 10);
    expect(normal.dot(forward)).toBeCloseTo(0, 10);
  });

  it('completes a great circle without accumulating drift', () => {
    const normal = spherical(0, 0);
    const forward = new Vector3(1, 0, 0);
    for (let i = 0; i < 1000; i++) advanceOnSphere(normal, forward, 2 * Math.PI * PLANET_RADIUS / 1000);
    expect(normal.distanceTo(spherical(0, 0))).toBeLessThan(1e-10);
  });

  it('has finite tangent fallbacks at poles and antipodes', () => {
    for (const normal of [spherical(90, 0), spherical(-90, 0), spherical(0, 0)]) {
      for (const direction of [normal, normal.clone().negate(), new Vector3()]) {
        const result = tangent(direction, normal);
        expect(result.length()).toBeCloseTo(1, 12);
        expect(result.dot(normal)).toBeCloseTo(0, 12);
      }
    }
  });

  it('reports right and left targets with matching steering signs', () => {
    const normal = spherical(0, 0);
    const forward = new Vector3(0, 1, 0);
    expect(headingTo(normal, forward, spherical(0, -20))).toBeCloseTo(Math.PI / 2);
    expect(headingTo(normal, forward, spherical(0, 20))).toBeCloseTo(-Math.PI / 2);
  });

  it('clamps dot products for stable distances', () => {
    expect(surfaceDistance(new Vector3(0, 1.0000000001, 0), new Vector3(0, 1, 0))).toBe(0);
    expect(surfaceDistance(spherical(0, 0), spherical(0, 180))).toBeCloseTo(Math.PI * PLANET_RADIUS);
  });

  it('generates deterministic scenery', () => {
    const a = seededRandom(417);
    const b = seededRandom(417);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
});
