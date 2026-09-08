import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BayLevel, type BayRoute } from './bay-level';
import { StationLevel, STATION_LEVEL } from './station-level';
import { GardenLevel, GARDEN_LEVEL } from './garden-level';
import { AuthoredLevel } from './authored-level';
import { type RoadRoute } from './road-level';
import { TourLayout, type TourRouteCache } from './tour-layout';
import { projectOnRoute, routeAhead, type RouteCursor } from './route-guidance';
import { headingTo, surfaceDistance, tangent } from './math';

const forwardAt = (level: AuthoredLevel, x: number, y: number, dx = 1, dy = 0) =>
  tangent(level.toNormal(x + dx * 0.01, y + dy * 0.01), level.toNormal(x, y));
const degrees = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;

// These checks exercise the canonical target, not a presentation-angle filter.
describe('authored navigation discontinuity regressions', () => {
  it('removes the exact Tour Bay y=1.3 jump with and without forward/cursor context', () => {
    const layout = new TourLayout(), bay = layout.stops[0].level;
    for (const tracking of [false, true]) {
      let cache: TourRouteCache | null = null;
      const headings: number[] = [];
      for (const y of [1.299, 1.301, 1.299, 1.301]) {
        const normal = bay.toNormal(-6, y), forward = forwardAt(bay, -6, y, 0, 1);
        expect(bay.sampleSurface(normal).kind).toBe('road');
        const result = layout.navigation(0, normal, tracking ? cache : null, true, tracking ? { forward } : {});
        const direct = bay.navigation(normal, tracking ? cache?.bayRoute ?? null : null, tracking ? { forward, cursor: cache?.localCursor } : {});
        expect(result.target).toEqual(direct.target);
        expect(result.route.bayRoute).toBe('coast');
        expect(projectOnRoute(result.target, bay.safeRoute).distance).toBeLessThan(1e-8);
        headings.push(headingTo(normal, forward, result.target));
        cache = result.route;
      }
      for (let i = 1; i < headings.length; i++) expect(degrees(headings[i], headings[i - 1])).toBeLessThan(0.2);
    }
  });

  it('removes the exact reachable Garden sample jump and looks 1.8 arc units ahead', () => {
    const level = new GardenLevel();
    for (const tracking of [false, true]) {
      let cursor: RouteCursor | null = null;
      const headings: number[] = [];
      for (const x of [-7.540, -7.536, -7.540, -7.536]) {
        const normal = level.toNormal(x, 1), forward = forwardAt(level, x, 1);
        expect(level.sampleSurface(normal).kind).toBe('road');
        for (const obstacle of [...GARDEN_LEVEL.beds, GARDEN_LEVEL.welcomeBed]) {
          expect(surfaceDistance(normal, level.toNormal(obstacle.center.x, obstacle.center.y))).toBeGreaterThan(obstacle.radius + 0.34);
        }
        const result = level.navigation(normal, 'inner', tracking ? { forward, cursor } : {});
        expect(result.route).toBe('inner');
        const target = projectOnRoute(result.target, level.innerRoute);
        expect(target.distance).toBeLessThan(1e-8);
        expect(target.progress - result.cursor!.progress).toBeCloseTo(1.8, 8);
        headings.push(headingTo(normal, forward, result.target));
        cursor = result.cursor;
      }
      expect(degrees(headings[0], headings[1])).toBeLessThan(0.3);
      expect(degrees(headings[1], headings[2])).toBeLessThan(0.3);
    }
  });

  it('holds Bay shared approach/fork choices under noise and respects deliberate intent', () => {
    const bay = new BayLevel();
    let previous: BayRoute | null = null, cursor: RouteCursor | null = null;
    for (let x = -8; x <= -6.05; x += 0.05) {
      const normal = bay.toNormal(x, 0.003 * Math.sin(x * 70));
      const result = bay.navigation(normal, previous, { cursor, forward: forwardAt(bay, x, 0) });
      expect(result.route).not.toBe('coast');
      expect(surfaceDistance(normal, result.target)).toBeGreaterThan(1);
      previous = result.route; cursor = result.cursor;
    }
    const fork = bay.toNormal(-6, 0);
    const north = bay.navigation(fork, previous, { cursor, forward: forwardAt(bay, -6, 0, 0, 1) });
    expect(north.route).toBe('coast');
    previous = north.route; cursor = north.cursor;
    for (let i = 0; i < 40; i++) {
      const x = -6 + 0.004 * Math.sin(i), y = 0.004 * Math.cos(i);
      const normal = bay.toNormal(x, y);
      const result = bay.navigation(normal, previous, { cursor, forward: forwardAt(bay, x, y, 0.71, 0.70) });
      expect(result.route).toBe('coast');
      previous = result.route; cursor = result.cursor;
    }
    expect(bay.navigation(fork, previous, { cursor, forward: forwardAt(bay, -6, 0) }).route).toBe('leap');
    // Geometry can override an old commitment even without forward context.
    expect(bay.navigation(bay.toNormal(-4, 0), 'coast').route).toBe('leap');
    expect(bay.navigation(bay.toNormal(-6, 2), 'leap').route).toBe('coast');
    expect(bay.navigation(bay.recoveryPose.normal, 'coast').route).toBeNull();
  });

  it.each([['Station', new StationLevel(), STATION_LEVEL], ['Garden', new GardenLevel(), GARDEN_LEVEL]] as const)(
    'keeps %s branch commitment under tiny road noise and permits switching/reset', (_, level, definition) => {
      for (const route of ['inner', 'outer'] as const) {
        const path = route === 'inner' ? level.innerRoute : level.outerRoute;
        let cursor: RouteCursor | null = null;
        let previous: RoadRoute | null = route;
        // Exercise sample boundaries over the course, away from terminal parking.
        for (let i = 15; i < path.length - 15; i += 3) {
          const normal = path[i], forward = tangent(path[i + 1], normal);
          const side = new Vector3().crossVectors(forward, normal).normalize();
          const a = normal.clone().addScaledVector(side, -0.001 / 15).normalize();
          const b = normal.clone().addScaledVector(side, 0.001 / 15).normalize();
          expect(level.sampleSurface(a).kind).toBe('road');
          expect(level.sampleSurface(b).kind).toBe('road');
          const first = level.navigation(a, previous, { forward, cursor });
          const second = level.navigation(b, first.route, { forward, cursor: first.cursor });
          expect(second.route).toBe(first.route);
          expect(degrees(headingTo(a, tangent(forward, a), first.target), headingTo(b, tangent(forward, b), second.target))).toBeLessThan(0.5);
          previous = second.route; cursor = second.cursor;
        }
      }
      const outer = level.outerRoute[Math.floor(level.outerRoute.length * 0.45)];
      const inner = level.innerRoute[Math.floor(level.innerRoute.length * 0.45)];
      expect(level.navigation(outer, 'inner').route).toBe('outer');
      expect(level.navigation(inner, 'outer').route).toBe('inner');
      expect(level.navigation(level.recoveryPose.normal, 'outer').route).toBeNull();
      const fork = level.toNormal(definition.fork.x, definition.fork.y);
      const outerIntent = tangent(routeAhead(fork, level.outerRoute).target, fork);
      const innerIntent = tangent(routeAhead(fork, level.innerRoute).target, fork);
      expect(level.navigation(fork, 'inner', { forward: outerIntent }).route).toBe('outer');
      expect(level.navigation(fork, 'outer', { forward: innerIntent }).route).toBe('inner');
    });

  it('reverses authored progress and reacquires after off-road travel or branch/level changes', () => {
    const bay = new BayLevel();
    let result = bay.navigation(bay.toNormal(-6, 2.5), 'coast');
    for (let y = 2.4; y >= 0.8; y -= 0.1) {
      const next = bay.navigation(bay.toNormal(-6, y), result.route, { cursor: result.cursor, forward: forwardAt(bay, -6, y, 0, 1) });
      expect(next.cursor!.progress).toBeLessThan(result.cursor!.progress);
      result = next;
    }
    const offRoad = bay.navigation(bay.toNormal(6, -3), result.route, { cursor: result.cursor });
    expect(offRoad.route).toBe('leap');
    const coast = bay.navigation(bay.toNormal(2.3, 5.3), offRoad.route, { cursor: offRoad.cursor });
    expect(coast.route).toBe('coast');
    const other = new BayLevel({ latitude: -15, longitude: 90 });
    const normal = other.toNormal(-6, 2);
    expect(other.navigation(normal, 'coast', { cursor: coast.cursor })).toEqual(other.navigation(normal, 'coast'));
  });
});

describe('Tour leg/region state and pure read contract', () => {
  it('keeps targets continuous across transfer/local boundaries in both directions', () => {
    const layout = new TourLayout(), level = layout.stops[1].level;
    let cache: TourRouteCache | null = null;
    let previous: { normal: Vector3; target: Vector3 } | null = null;
    // Station west boundary at x=-13; transition occurs only beyond its 0.35 band.
    const phases = new Set<string>();
    for (const x of Array.from({ length: 121 }, (_, i) => -13.6 + i * 0.01)) {
      const normal = level.toNormal(x, 0), result = layout.navigation(1, normal, cache, true);
      phases.add(result.phase);
      if (previous) expect(surfaceDistance(result.target, previous.target)).toBeLessThan(0.012);
      previous = { normal, target: result.target }; cache = result.route;
    }
    expect([...phases]).toEqual(['transfer', 'local']);
    for (const x of [-13.001, -12.999, -13.002, -12.998]) {
      const result = layout.navigation(1, level.toNormal(x, 0), cache, true);
      expect(result.phase).toBe('local'); cache = result.route;
    }
    expect(layout.navigation(1, level.toNormal(-13.5, 0), cache, true).phase).toBe('transfer');
    const transfer = layout.navigation(1, level.toNormal(-13.5, 0), null, true);
    for (const x of [-13.001, -12.999, -13.002, -12.998]) {
      expect(layout.navigation(1, level.toNormal(x, 0), transfer.route, true).phase).toBe('transfer');
    }
    expect(layout.navigation(1, level.toNormal(-12.999, 0), null, true).phase).toBe('local');
    previous = null;
    const reversePhases = new Set<string>();
    for (const x of Array.from({ length: 121 }, (_, i) => -12.4 - i * 0.01)) {
      const normal = level.toNormal(x, 0), result = layout.navigation(1, normal, cache, true);
      reversePhases.add(result.phase);
      if (previous) expect(surfaceDistance(result.target, previous.target)).toBeLessThan(0.012);
      previous = { normal, target: result.target }; cache = result.route;
    }
    expect([...reversePhases]).toEqual(['local', 'transfer']);
  });

  it('invalidates caches across legs, teleports, recovery, flight, and closing free roam', () => {
    const layout = new TourLayout(), station = layout.stops[1].level, garden = layout.stops[2].level;
    const old = layout.navigation(1, station.toNormal(-2.5, -4.8), null, true);
    expect(old.route.route).toBe('outer');
    const normal = garden.toNormal(-6.4, 1.95);
    expect(layout.navigation(2, normal, old.route, true)).toEqual(layout.navigation(2, normal, null, true));
    const recovery = layout.navigation(1, station.recoveryPose.normal, old.route, true);
    expect(recovery.route.route).toBeNull();
    const departure = layout.stops[0].destination.normal;
    expect(layout.navigation(1, departure, old.route, true)).toEqual(layout.navigation(1, departure, null, true));
    const airborne = layout.navigation(1, station.toNormal(-2.5, -4.8), old.route, false);
    expect(airborne.target).toEqual(station.destination.normal);
    expect(airborne.route.cursor).toBeNull();
    expect(airborne.route.localCursor).toBeNull();
    const closing = layout.navigation(3, garden.destination.normal, old.route, true);
    expect(closing.phase).toBe('transfer');
    expect(closing.route.route).toBeNull();
    expect(closing.route.cursor!.path).toBe(layout.connectors[2].path);
    for (const index of [-1, 0.5, 4, NaN]) expect(() => layout.navigation(index, normal, null, true)).toThrow(RangeError);
  });

  it('is passive and does not mutate pose, cache, authored paths or destinations', () => {
    const layout = new TourLayout(), bay = layout.stops[0].level;
    const normal = bay.toNormal(-6, 1.3), forward = forwardAt(bay, -6, 1.3, 0, 1);
    const cache = layout.navigation(0, normal, null, true, { forward }).route;
    const inputs = { normal, forward, cache, route: bay.safeRoute, destination: bay.destination.normal };
    const before = JSON.stringify(inputs);
    const a = layout.navigation(0, normal, cache, true, { forward });
    const b = layout.navigation(0, normal, cache, true, { forward });
    expect(a).toEqual(b);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(a.target.length()).toBeCloseTo(1, 12);
    a.target.set(0, 0, 0); a.route.normal!.set(0, 0, 0); a.route.cursor!.normal.set(0, 0, 0);
    expect(JSON.stringify(inputs)).toBe(before);
    for (const level of [bay, new StationLevel(), new GardenLevel()]) {
      const air = level.navigation(level.spawnPose.normal, null, { grounded: false });
      expect(air.target).toEqual(level.destination.normal);
      expect(air.target).not.toBe(level.destination.normal);
      expect(air.cursor).toBeNull();
    }
  });
});
