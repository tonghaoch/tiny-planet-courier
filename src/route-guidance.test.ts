import { describe, expect, it } from 'vitest';
import { spherical, surfaceDistance, tangent, headingTo } from './math';
import { projectOnRoute, routeAhead, type RouteCursor } from './route-guidance';

const equator = (metres: number) => spherical(0, ((metres / 15) * 180) / Math.PI);
const point = (x: number, y: number) => spherical(((y / 15) * 180) / Math.PI, ((x / 15) * 180) / Math.PI);

describe('continuous spherical route guidance', () => {
  it('projects exactly onto minor arcs and advances by arc length across corners', () => {
    const path = [equator(0), equator(2), point(2, 4)];
    const normal = point(1.1, 0.4);
    const result = routeAhead(normal, path);
    expect(result.progress).toBeCloseTo(1.1, 10);
    expect(result.distance).toBeCloseTo(0.4, 10);
    expect(result.targetProgress).toBeCloseTo(2.9, 10);
    expect(surfaceDistance(result.target, point(2, 0.9))).toBeLessThan(1e-6);
    expect(projectOnRoute(result.target, path).distance).toBeLessThan(1e-10);
    expect(surfaceDistance(normal, result.target)).toBeLessThan(1.8);
    expect(result.target.equals(path[1])).toBe(false);
  });

  it('is invariant under subdivision of the same spherical arcs', () => {
    const sparse = [equator(0), equator(8)];
    const dense = Array.from({ length: 41 }, (_, i) => equator(i * 0.2));
    for (let x = 0.05; x < 7.9; x += 0.131) {
      const a = routeAhead(point(x, 0.4), sparse),
        b = routeAhead(point(x, 0.4), dense);
      expect(a.progress).toBeCloseTo(b.progress, 10);
      expect(a.target.distanceTo(b.target)).toBeLessThan(1e-12);
    }
  });

  it('handles obtuse segments, endpoint clamping and coincident samples without NaN', () => {
    const path = [equator(0), equator(0), equator(30)];
    expect(projectOnRoute(point(25, 2), path).progress).toBeCloseTo(25, 10);
    expect(routeAhead(equator(-1), path).progress).toBe(0);
    expect(routeAhead(equator(31), path).target.distanceTo(equator(30))).toBeLessThan(1e-12);
    for (const normal of [equator(0), equator(45), point(20, 20)]) {
      for (const route of [path, [equator(1)], [equator(1), equator(1)]]) {
        const result = routeAhead(normal, route);
        expect(
          [result.progress, result.distance, result.targetProgress, result.target.length()].every(Number.isFinite),
        ).toBe(true);
        expect(result.target.length()).toBeCloseTo(1, 12);
      }
    }
    expect(() => routeAhead(equator(0), [])).toThrow(RangeError);
  });

  it('holds a competing segment under tiny noise, then reacquires a deliberate crossing', () => {
    const path = [point(0, 0), point(8, 0), point(8, 0.5), point(0, 0.5)];
    let result = routeAhead(point(3, 0.24), path);
    const progress = result.progress;
    for (const y of [0.251, 0.249, 0.252, 0.248]) {
      result = routeAhead(point(3, y), path, result.cursor);
      expect(Math.abs(result.progress - progress)).toBeLessThan(0.01);
    }
    const switched = routeAhead(point(3, 0.5), path, result.cursor);
    expect(switched.progress).toBeGreaterThan(12);
    const teleported = routeAhead(point(7, 0), path, switched.cursor);
    expect(teleported.progress).toBeCloseTo(7, 10);
    const offRoute = routeAhead(point(3, 3), path, result.cursor);
    expect(offRoute.progress).toBeGreaterThan(12);
    const returned = routeAhead(point(3, 0.5), path, offRoute.cursor);
    expect(returned.progress).toBeGreaterThan(12);
  });

  it('allows continuous reverse progress, resets on path identity, and never mutates inputs', () => {
    const path = [equator(0), equator(8)],
      normal = point(5, 0.1);
    const snapshot = JSON.stringify({ path, normal });
    const initial = routeAhead(normal, path);
    const cursorSnapshot = JSON.stringify(initial.cursor);
    let cursor: RouteCursor = initial.cursor;
    for (let x = 4.9; x >= 1; x -= 0.1) {
      const next = routeAhead(point(x, 0.1), path, cursor);
      expect(next.progress).toBeLessThan(cursor.progress);
      expect(next.targetProgress - next.progress).toBeCloseTo(1.8, 10);
      cursor = next.cursor;
    }
    const reversedPath = [...path].reverse();
    const reset = routeAhead(normal, reversedPath, initial.cursor);
    expect(reset.progress).toBeCloseTo(3, 10);
    expect(JSON.stringify(initial.cursor)).toBe(cursorSnapshot);
    expect(JSON.stringify({ path, normal })).toBe(snapshot);
    expect(routeAhead(normal, path, initial.cursor)).toEqual(routeAhead(normal, path, initial.cursor));
    initial.target.set(0, 0, 0);
    initial.point.set(0, 0, 0);
    expect(JSON.stringify({ path, normal })).toBe(snapshot);
  });

  it('keeps bearing continuous across former nearest-sample boundaries', () => {
    const path = [equator(0), equator(2), point(2, 3)];
    const headings = [0.999, 1.001].map(x => {
      const n = point(x, 0.1);
      return headingTo(n, tangent(equator(x + 0.01), n), routeAhead(n, path).target);
    });
    expect((Math.abs(headings[1] - headings[0]) * 180) / Math.PI).toBeLessThan(0.15);
  });
});
