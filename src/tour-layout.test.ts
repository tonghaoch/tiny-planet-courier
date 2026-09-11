import { describe, expect, it } from 'vitest';
import { CubicBezierCurve3, Vector3 } from 'three';
import { AuthoredLevel, densify, point } from './authored-level';
import { BAY_LEVEL, BayLevel } from './bay-level';
import { STATION_LEVEL, StationLevel } from './station-level';
import { GARDEN_LEVEL, GardenLevel } from './garden-level';
import { BayDrive } from './bay-driving';
import { TourLayout } from './tour-layout';
import { TourSession } from './tour-session';
import { DeliveryRun } from './game';
import { createTourPlan, TOUR_LOCATION_IDS } from './tour-itinerary';
import { BEACON_LEVEL, DEPOT_LEVEL } from './tour-outposts';
import { projectOnRoute } from './route-guidance';
import { advanceOnSphere, headingTo, PLANET_RADIUS, spherical, surfaceDistance, tangent, type Collider } from './math';
import { createBayPilot } from '../tests/helpers/bay-pilot';

function authoredColliders(layout: TourLayout): Collider[] {
  const [bay, station, garden] = layout.stops.map(stop => stop.level);
  const collider = (level: AuthoredLevel, center: { x: number; y: number }, radius: number): Collider => ({
    normal: level.toNormal(center.x, center.y),
    radius,
  });
  return [
    collider(bay, BAY_LEVEL.bakery.center, BAY_LEVEL.bakery.colliderRadius),
    collider(station, STATION_LEVEL.station.center, STATION_LEVEL.station.colliderRadius),
    ...STATION_LEVEL.obstacles.map(o => collider(station, o.center, o.radius)),
    collider(garden, GARDEN_LEVEL.windmill.center, GARDEN_LEVEL.windmill.colliderRadius),
    ...[...GARDEN_LEVEL.beds, GARDEN_LEVEL.welcomeBed].map(o => collider(garden, o.center, o.radius)),
    ...[BEACON_LEVEL, DEPOT_LEVEL].map((definition, i) =>
      collider(layout.stops[i + 3].level, definition.landmark.center, definition.landmark.colliderRadius),
    ),
  ];
}

function tourPilot(drive: BayDrive, route: Vector3[], destination: Vector3, shortcut: boolean) {
  const pilot = createBayPilot(route, destination, shortcut);
  const exit = route[Math.min(10, route.length - 1)];
  let turning = Math.abs(headingTo(drive.normal, drive.forward, exit)) > Math.PI / 2;
  return () => {
    // The accepted outer courses park facing back toward their approach. Back out
    // and turn using real reverse/steer inputs rather than resetting heading at handoff.
    if (turning) {
      const angle = headingTo(drive.normal, drive.forward, exit);
      if (Math.abs(angle) > 0.65) return { throttle: -1, steer: -Math.sign(angle), boost: false };
      turning = false;
    }
    return pilot(drive);
  };
}

function offset(normal: Vector3, forward: Vector3, distance: number): Vector3 {
  const n = normal.clone();
  advanceOnSphere(n, new Vector3().crossVectors(forward, normal).normalize(), distance);
  return n;
}

describe('Tour placement and shared road geometry', () => {
  it('preserves standalone definitions, spawn poses, and local route samples exactly', () => {
    const before = JSON.stringify([BAY_LEVEL, STATION_LEVEL, GARDEN_LEVEL]);
    const layout = new TourLayout();
    const defaults = [new BayLevel(), new StationLevel(), new GardenLevel()];
    defaults.forEach((level, i) => {
      const definition = [BAY_LEVEL, STATION_LEVEL, GARDEN_LEVEL][i];
      const baseline = new AuthoredLevel({ ...definition, destination: level.definition.destination });
      expect(level.definition).toEqual(baseline.definition);
      expect(level.spawnPose).toEqual(baseline.spawnPose);
      expect(level.recoveryPose).toEqual(baseline.recoveryPose);
      expect(level.definition.radius).toBe(15);
      expect(level.definition.roads).toBe(definition.roads);
      const placed = layout.stops[i].level;
      for (const p of [point(-8, 0), point(0, 0), point(2, 3)]) {
        const local = placed.toLocal(placed.toNormal(p.x, p.y));
        expect(local.x).toBeCloseTo(p.x, 10);
        expect(local.y).toBeCloseTo(p.y, 10);
      }
    });
    expect(defaults[0].route(BAY_LEVEL.safeRouteCenterline)).toEqual(new BayLevel().safeRoute);
    expect(layout.stops[0].level.safeRoute).toEqual(layout.stops[0].level.route(BAY_LEVEL.safeRouteCenterline));
    expect(layout.stops[0].level.jumpRoute).toEqual(layout.stops[0].level.route(BAY_LEVEL.jumpRouteCenterline));
    expect(layout.stops.slice(0, 3).map(s => s.level.definition.anchor)).toEqual([
      { latitude: 20, longitude: 0 },
      { latitude: -8, longitude: 125 },
      { latitude: 28, longitude: -115 },
    ]);
    expect(JSON.stringify([BAY_LEVEL, STATION_LEVEL, GARDEN_LEVEL])).toBe(before);
  });

  it('retains every exact northern connector sample from the three-stop construction', () => {
    const layout = new TourLayout();
    const exits = [13.5, 5, 5.5];
    const entries = [-12.5, -14.5, -16.5];
    for (let index = 0; index < 3; index++) {
      const from = layout.stops[index].level;
      const toIndex = (index + 1) % 3;
      const to = layout.stops[toIndex].level;
      const exit = from.toNormal(exits[index], 0);
      const entry = to.toNormal(entries[toIndex], 0);
      const departure = tangent(from.toNormal(exits[index] + 0.01, 0), exit);
      const arrival = tangent(to.toNormal(entries[toIndex] + 0.01, 0), entry);
      const handle = Math.min(5, surfaceDistance(exit, entry) / 3);
      const exterior = new CubicBezierCurve3(
        exit.clone().multiplyScalar(PLANET_RADIUS),
        exit.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(departure, handle),
        entry.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(arrival, -handle),
        entry.clone().multiplyScalar(PLANET_RADIUS),
      )
        .getPoints(80)
        .map(n => n.normalize());
      const nodes = [
        ...from.route([from.definition.pad.center, point(exits[index], 0)]),
        ...exterior.slice(1),
        ...to.route([point(entries[toIndex], 0), to.definition.spawn.position]).slice(1),
      ];
      const expected = [nodes[0].clone()];
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1],
          b = nodes[i];
        const angle = surfaceDistance(a, b) / PLANET_RADIUS;
        const steps = Math.max(1, Math.ceil((angle * PLANET_RADIUS) / 0.22));
        const direction = tangent(b, a);
        for (let j = 1; j <= steps; j++)
          expected.push(
            j === steps
              ? b.clone()
              : a
                  .clone()
                  .multiplyScalar(Math.cos((angle * j) / steps))
                  .addScaledVector(direction, Math.sin((angle * j) / steps))
                  .normalize(),
          );
      }
      expect(layout.connectors[index]).toEqual({ from: index, to: toIndex, width: 1.8, path: expected });
    }
  });

  it('takes ownership of anchor overrides without mutating callers or global defaults', () => {
    for (const Level of [BayLevel, StationLevel, GardenLevel]) {
      const anchor = { latitude: 11, longitude: 22 };
      const level = new Level(anchor);
      const pose = level.spawnPose.normal.clone();
      anchor.latitude = -77;
      expect(level.definition.anchor.latitude).toBe(11);
      expect(level.spawnPose.normal).toEqual(pose);
      expect(level.toNormal(0, 0)).toEqual(spherical(11, 22));
    }
  });

  it('keeps relocated footprints disjoint, with more than six units between sampled boundaries', () => {
    const layout = new TourLayout();
    const boundaries = layout.stops.slice(0, 3).map(({ level }) => {
      const polygon = level.definition.footprintPolygon;
      return level.route([...polygon, polygon[0]]);
    });
    let gap = Infinity;
    layout.stops.slice(0, 3).forEach(({ level }, index) => {
      for (let x = -16; x <= 14; x += 0.5)
        for (let y = -8; y <= 10; y += 0.5) {
          const normal = level.toNormal(x, y);
          if (level.isInFootprint(normal))
            expect(layout.stops.filter(s => s.level.isInFootprint(normal))).toHaveLength(1);
        }
      boundaries[index].forEach(normal => {
        layout.stops.forEach((other, j) => {
          if (j !== index) expect(other.level.isInFootprint(normal)).toBe(false);
        });
        for (let j = index + 1; j < boundaries.length; j++)
          for (const other of boundaries[j]) gap = Math.min(gap, surfaceDistance(normal, other));
      });
    });
    expect(gap).toBeGreaterThan(6);
  });

  it('connects all pads and entrances with dense, supported roads clear of water and authored obstacles', () => {
    const layout = new TourLayout();
    const colliders = authoredColliders(layout);
    expect(layout.connectors.map(c => [c.from, c.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [1, 4],
      [4, 3],
      [3, 1],
    ]);
    for (const connector of layout.connectors) {
      expect(connector.path[0]).toEqual(layout.stops[connector.from].destination.normal);
      const delivered = layout.stops[connector.from].deliveredPose;
      expect(delivered.normal).toEqual(connector.path[0]);
      expect(delivered.forward.dot(tangent(connector.path[1], delivered.normal))).toBeCloseTo(1, 10);
      expect(delivered.forward.dot(delivered.normal)).toBeCloseTo(0, 12);
      expect(connector.path.at(-1)!.distanceTo(layout.stops[connector.to].entryPose.normal)).toBeLessThan(1e-12);
      for (let i = 0; i < connector.path.length; i++) {
        const n = connector.path[i];
        expect(n.length()).toBeCloseTo(1, 12);
        if (i) expect(surfaceDistance(n, connector.path[i - 1])).toBeLessThanOrEqual(0.220001);
        const forward =
          i < connector.path.length - 1
            ? tangent(connector.path[i + 1], n)
            : tangent(n.clone().sub(connector.path[i - 1]), n);
        for (const side of [-1, 0, 1]) {
          const edge = offset(n, forward, (side * connector.width) / 2);
          const message = `connector ${connector.from}->${connector.to}, sample ${i}, side ${side}`;
          expect(layout.sampleSurface(edge).kind, message).toBe('road');
          expect(layout.sampleSurface(edge).radius, message).toBe(PLANET_RADIUS + 0.085);
          expect(layout.isInSceneryClearance(edge), message).toBe(true);
          for (const collider of colliders)
            expect(surfaceDistance(edge, collider.normal), message).toBeGreaterThan(collider.radius + 0.05);
          const bay = layout.stops[0].level;
          if (bay.isInFootprint(edge)) expect(bay.sampleSurface(edge).kind, message).not.toBe('water');
          for (let stop = 0; stop < layout.stops.length; stop++) {
            if (stop !== connector.from && stop !== connector.to)
              expect(layout.stops[stop].level.isInFootprint(edge), message).toBe(false);
          }
        }
      }
    }
  });

  it('uses owning authored water/ramp/road surfaces before ground or connector fallback', () => {
    const layout = new TourLayout();
    const bay = layout.stops[0].level;
    expect(layout.sampleSurface(bay.toNormal(0, 0))).toEqual({ kind: 'water', radius: BAY_LEVEL.surfaceRadii.water });
    expect(layout.sampleSurface(bay.toNormal(-3.5, 0))).toEqual(bay.sampleSurface(bay.toNormal(-3.5, 0)));
    for (const stop of layout.stops) {
      for (const road of Object.values(stop.level.definition.roads))
        for (const p of densify(road.centerline)) {
          const n = stop.level.toNormal(p.x, p.y);
          expect(layout.sampleSurface(n)).toEqual(stop.level.sampleSurface(n));
        }
    }
    const previous = bay.toNormal(-2.8, 0),
      next = bay.toNormal(-2.6, 0);
    expect(layout.crossRampLip(previous, next)).toEqual(bay.crossRampLip(previous, next));
    expect(layout.crossRampLip(previous, next)).not.toBeNull();
    expect(layout.crossRampLip(next, previous)).toBeNull();
    const station = layout.stops[1].level;
    expect(layout.crossRampLip(station.toNormal(-2.8, 0), station.toNormal(-2.6, 0))).toBeNull();
    expect(layout.sampleSurface(spherical(-80, 0))).toEqual({ kind: 'ground', radius: 15.075 });
    expect(layout.isInSceneryClearance(spherical(-80, 0))).toBe(false);
    // The navigation jump path is never automatically converted into a supported connector.
    expect(layout.isOnConnector(bay.toNormal(0, 0))).toBe(false);
  });

  it('uses full connector widths for support and extends only scenery clearance beyond them', () => {
    const layout = new TourLayout();
    for (const connector of layout.connectors) {
      const i = Math.floor(connector.path.length / 2);
      const n = connector.path[i],
        forward = tangent(connector.path[i + 1], n);
      const inside = offset(n, forward, 0.89),
        outside = offset(n, forward, 1.05);
      expect(layout.isOnConnector(inside)).toBe(true);
      expect(layout.isOnConnector(outside)).toBe(false);
      expect(layout.sampleSurface(outside).kind).toBe('ground');
      expect(layout.isInSceneryClearance(outside, 0.2)).toBe(true);
    }
  });

  it('returns independent route/pose vectors while retaining the complete live collider array', () => {
    const layout = new TourLayout();
    const colliders: Collider[] = [];
    const environment = layout.createEnvironment(colliders);
    expect(environment.colliders).toBe(colliders);
    colliders.push({ normal: layout.spawnPose.normal.clone(), radius: 1 });
    expect(environment.colliders).toHaveLength(1);
    const spawn = layout.spawnPose.normal.clone();
    environment.spawnPose.normal.set(0, 0, 0);
    environment.recoveryPose = {
      normal: layout.stops[1].entryPose.normal.clone(),
      forward: layout.stops[1].entryPose.forward.clone(),
    };
    expect(layout.spawnPose.normal).toEqual(spawn);
    for (const variant of ['wide', 'short'] as const)
      for (let i = 0; i < 3; i++) {
        const route = layout.routeForLeg(i, variant);
        expect(route[0]).toEqual(i === 0 ? layout.spawnPose.normal : layout.stops[i - 1].destination.normal);
        expect(route.at(-1)).toEqual(layout.stops[i].destination.normal);
        const first = route[0].clone();
        route[0].set(0, 0, 0);
        expect(layout.routeForLeg(i, variant)[0]).toEqual(first);
      }
    expect(() => layout.routeForLeg(3, 'wide')).toThrow(RangeError);
  });
});

describe('Tour route-aware navigation', () => {
  it('changes from transfer to local on free off-road arrival, without enforcing an entrance', () => {
    const layout = new TourLayout();
    const departure = layout.stops[0].destination.normal;
    const transfer = layout.navigation(1, departure, { index: 0, route: 'outer' }, true);
    expect(transfer.phase).toBe('transfer');
    expect(transfer.route).toMatchObject({ index: 1, route: null });
    expect(transfer.target.distanceTo(departure)).toBeGreaterThan(0.05);
    const projectedTarget = projectOnRoute(transfer.target, layout.connectors[0].path);
    expect(projectedTarget.distance).toBeLessThan(1e-8);
    expect(projectedTarget.progress).toBeCloseTo(1.8, 8);
    const station = layout.stops[1].level;
    const normal = station.toNormal(-4.6, 1.7);
    const local = layout.navigation(1, normal, transfer.route, true);
    expect(local.phase).toBe('local');
    expect(local.target.distanceTo(station.navigation(normal, null).target)).toBeLessThan(1e-10);
    expect(local.route.route).toBe('inner');
    const atPad = layout.navigation(1, station.destination.normal, null, true);
    expect(atPad.target.distanceTo(station.destination.normal)).toBeLessThan(1e-12);
    expect(layout.navigation(2, layout.stops[2].level.toNormal(-5, -5), local.route, true).route.index).toBe(2);
  });

  it('keeps airborne guidance on the destination and delegates grounded Bay guidance', () => {
    const layout = new TourLayout();
    for (let i = 0; i < 3; i++) {
      const navigation = layout.navigation(i, layout.spawnPose.normal, null, false);
      expect(navigation.target).toEqual(layout.stops[i].destination.normal);
    }
    const bay = layout.stops[0].level;
    const rampNormal = bay.toNormal(-4, 0);
    const leap = layout.navigation(0, rampNormal, null, true);
    expect(leap.target).toEqual(bay.navigation(rampNormal).target);
    expect(projectOnRoute(leap.target, bay.jumpRoute).distance).toBeLessThan(1e-8);
    expect(
      projectOnRoute(leap.target, bay.jumpRoute).progress - projectOnRoute(rampNormal, bay.jumpRoute).progress,
    ).toBeCloseTo(1.8, 8);
    expect(layout.navigation(0, bay.toNormal(-3, 5), null, true).target).not.toEqual(bay.destination.normal);
    expect(layout.navigation(3, layout.stops[2].destination.normal, null, true).phase).toBe('transfer');
  });
});

describe('five-site directed routing and physical expansion', () => {
  it('composes all 20 ordered pairs and every spawn departure with stable paths', () => {
    const layout = new TourLayout();
    for (const from of ['spawn', ...TOUR_LOCATION_IDS] as const)
      for (const to of TOUR_LOCATION_IDS) {
        if (from === to) continue;
        for (const variant of ['wide', 'short'] as const) {
          const path = layout.routeBetween(from, to, variant);
          expect(path).toBe(layout.routeBetween(from, to, variant));
          expect(path[0]).toEqual(
            from === 'spawn' ? layout.spawnPose.normal : layout.location(from).destination.normal,
          );
          expect(path.at(-1)).toEqual(layout.location(to).destination.normal);
          for (let i = 1; i < path.length; i++)
            expect(surfaceDistance(path[i - 1], path[i])).toBeLessThanOrEqual(0.220001);
          if (variant === 'wide') for (const normal of path) expect(layout.sampleSurface(normal).kind).toBe('road');
          const edges = layout.connectorsBetween(from === 'spawn' ? 'bay' : from, to);
          edges.forEach((edge, i) => {
            if (i) expect(edge.from).toBe(edges[i - 1].to);
            expect(path.some(normal => normal.distanceTo(edge.path[0]) < 1e-12)).toBe(true);
            expect(path.some(normal => normal.distanceTo(edge.path.at(-1)!) < 1e-12)).toBe(true);
          });
        }
      }
    for (let seed = 0; seed < 20; seed++) {
      const session = new TourSession(layout, createTourPlan(seed));
      for (let index = 0; index < 10; index++) {
        const path = session.routeForLeg(index, 'wide');
        expect(path).toBe(session.routeForLeg(index, 'wide'));
        expect(path.at(-1)).toEqual(session.destinations[index].normal);
      }
    }
  });

  it('keeps all five footprints disjoint and connector round caps dry and clear', () => {
    const layout = new TourLayout();
    const colliders = authoredColliders(layout);
    let gap = Infinity;
    const boundaries = layout.stops.map(({ level }) =>
      level.route([...level.definition.footprintPolygon, level.definition.footprintPolygon[0]]),
    );
    for (let i = 0; i < layout.stops.length; i++) {
      for (const normal of boundaries[i]) {
        expect(layout.stops.filter(stop => stop.level.isInFootprint(normal))).toHaveLength(1);
        for (let j = i + 1; j < boundaries.length; j++)
          for (const other of boundaries[j]) gap = Math.min(gap, surfaceDistance(normal, other));
      }
    }
    expect(gap).toBeGreaterThan(1.8);
    for (const connector of layout.connectors)
      for (const normal of [connector.path[0], connector.path.at(-1)!]) {
        const forward = tangent(new Vector3(0, 1, 0), normal);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const edge = normal.clone();
          advanceOnSphere(edge, forward.clone().applyAxisAngle(normal, angle), connector.width / 2);
          expect(layout.sampleSurface(edge).kind).toBe('road');
          expect(layout.isInSceneryClearance(edge)).toBe(true);
          for (const collider of colliders)
            expect(surfaceDistance(edge, collider.normal)).toBeGreaterThan(collider.radius + 0.05);
        }
      }
  });

  it('records actual road length, latitude extent, and new road outside old corridors', () => {
    const layout = new TourLayout();
    const length = (path: Vector3[]) => path.reduce((sum, n, i) => sum + (i ? surfaceDistance(path[i - 1], n) : 0), 0);
    const localRoads = layout.stops.map(stop =>
      Object.values(stop.level.definition.roads).map(road => stop.level.route(road.centerline)),
    );
    const oldPaths = [...layout.connectors.slice(0, 3).map(c => c.path), ...localRoads.slice(0, 3).flat()];
    const newPaths = [...layout.connectors.slice(3).map(c => c.path), ...localRoads.slice(3).flat()];
    const extent = (paths: Vector3[][]) => {
      const latitudes = paths.flat().map(n => (Math.asin(n.y) * 180) / Math.PI);
      return [Math.min(...latitudes), Math.max(...latitudes)];
    };
    let outside = 0;
    for (const path of newPaths)
      for (let i = 1; i < path.length; i++) {
        const midpoint = path[i - 1].clone().add(path[i]).normalize();
        const inOld =
          layout.stops.slice(0, 3).some(stop => stop.level.isInFootprint(midpoint)) ||
          layout.connectors.slice(0, 3).some(c => projectOnRoute(midpoint, c.path).distance <= c.width / 2);
        if (!inOld) outside += surfaceDistance(path[i - 1], path[i]);
      }
    const metrics = {
      baselineRoadLength: oldPaths.reduce((sum, path) => sum + length(path), 0),
      addedRoadLength: newPaths.reduce((sum, path) => sum + length(path), 0),
      baselineLatitude: extent(oldPaths),
      expandedLatitude: extent([...oldPaths, ...newPaths]),
      addedLengthOutsideOldFootprintsAndCorridors: outside,
    };
    console.info('Tour physical metrics (authored centerline sums, shared branches counted):', JSON.stringify(metrics));
    expect(metrics.addedRoadLength).toBeGreaterThan(50);
    expect(metrics.addedLengthOutsideOldFootprintsAndCorridors).toBeGreaterThan(40);
    expect(metrics.expandedLatitude[0]).toBeLessThan(metrics.baselineLatitude[0] - 10);
  });

  it('keys navigation by plan/occurrence and chooses Bay coast/leap on repeated arrivals', () => {
    const layout = new TourLayout();
    const plan = createTourPlan(0);
    const index = plan.order.lastIndexOf('bay');
    const bay = layout.stops[0].level;
    for (const [normal, route] of [
      [bay.toNormal(-4, 0), 'leap'],
      [bay.toNormal(-3, 5), 'coast'],
    ] as const) {
      const navigation = layout.navigation(index, normal, null, true, {}, plan);
      expect(navigation.route.bayRoute).toBe(route);
      expect(navigation.route.cursor?.path).toBe(layout.routeForLeg(index, route === 'coast' ? 'wide' : 'short', plan));
      const other = createTourPlan(1);
      const changed = layout.navigation(index, normal, navigation.route, true, {}, other);
      expect(changed.route.legKey).not.toBe(navigation.route.legKey);
    }
  });

  it.each(
    TOUR_LOCATION_IDS.flatMap(from => TOUR_LOCATION_IDS.filter(to => to !== from).map(to => [from, to] as const)),
  )('drives %s -> %s with real inputs through safe intermediate locales', (from, to) => {
    const layout = new TourLayout();
    const environment = layout.createEnvironment(authoredColliders(layout));
    // Initialize this independent leg at its departure pad; never teleport between waypoints.
    environment.spawnPose = layout.location(from).deliveredPose;
    const drive = new BayDrive(environment);
    const destination = layout.location(to).destination;
    const run = new DeliveryRun([destination]);
    run.start();
    const pilot = tourPilot(drive, layout.routeBetween(from, to, 'wide'), destination.normal, false);
    let collisions = 0;
    for (let tick = 0; tick < 120 * 180 && !run.finished; tick++) {
      collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
      run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(run.finished, `${from}->${to}: ${JSON.stringify(layout.location(to).level.toLocal(drive.normal))}`).toBe(
      true,
    );
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
    expect(drive.jumps).toBe(0);
  });

  it.each(TOUR_LOCATION_IDS)('drives the actual Bay spawn to first target %s', to => {
    const layout = new TourLayout();
    const drive = new BayDrive(layout.createEnvironment(authoredColliders(layout)));
    const destination = layout.location(to).destination;
    const run = new DeliveryRun([destination]);
    run.start();
    const pilot = tourPilot(drive, layout.routeBetween('spawn', to, 'wide'), destination.normal, false);
    let collisions = 0;
    for (let tick = 0; tick < 120 * 180 && !run.finished; tick++) {
      collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
      run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(run.finished).toBe(true);
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
  });
});

describe('continuous Tour routes using the accepted controller and real inputs', () => {
  it.each([0, 1])('drives all ten deliveries for seed %s without resetting motion at handoffs', seed => {
    const layout = new TourLayout();
    const environment = layout.createEnvironment(authoredColliders(layout));
    const drive = new BayDrive(environment);
    const session = new TourSession(layout, createTourPlan(seed));
    session.start();
    let collisions = 0;
    for (let leg = 0; leg < 10; leg++) {
      const destination = session.target!.normal;
      const pilot = tourPilot(drive, session.routeForLeg(leg, 'wide'), destination, false);
      for (let tick = 0; tick < 120 * 180 && session.index === leg; tick++) {
        collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
        session.updateLocation(drive.normal, drive.phase === 'grounded');
        const before = { normal: drive.normal.clone(), forward: drive.forward.clone(), speed: drive.speed };
        const event = session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
        if (event) {
          expect(drive.normal).toEqual(before.normal);
          expect(drive.forward).toEqual(before.forward);
          expect(drive.speed).toBe(before.speed);
          expect(event.locationId).toBe(session.plan.order[leg]);
        }
        environment.recoveryPose = session.checkpoint.pose;
      }
      expect(
        session.index,
        `seed ${seed}, leg ${leg}, at ${JSON.stringify(layout.stops.map(s => s.level.toLocal(drive.normal)))}`,
      ).toBe(leg + 1);
      expect(session.finished).toBe(leg === 9);
      expect(collisions).toBe(0);
      expect(drive.recoveries).toBe(0);
    }
    expect(session.splits).toHaveLength(10);
    expect(session.splits.reduce((sum, split) => sum + split.elapsed, 0)).toBeCloseTo(session.elapsed, 12);
    const finishedTime = session.elapsed;
    for (let tick = 0; tick < 120; tick++) {
      drive.update(1 / 120, { throttle: 1, steer: 0, boost: false });
      session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(session.elapsed).toBe(finishedTime);
    expect(session.navigation(drive.normal, null, true).target).toEqual(session.destinations[9].normal);
  });

  it.each(['wide', 'short'] as const)(
    'drives all %s legs and the closing connector without teleport or recovery',
    variant => {
      const layout = new TourLayout();
      const environment = layout.createEnvironment(authoredColliders(layout));
      const drive = new BayDrive(environment);
      const session = new DeliveryRun(layout.destinations.slice(0, 3), { keepDrivingOnFinish: true });
      session.start();
      let collisions = 0;
      const collisionLocations: unknown[] = [];
      for (let leg = 0; leg < 3; leg++) {
        const pilot = tourPilot(
          drive,
          layout.routeForLeg(leg, variant),
          layout.stops[leg].destination.normal,
          leg === 0 && variant === 'short',
        );
        for (let tick = 0; tick < 120 * 80 && session.index === leg; tick++) {
          const events = drive.update(1 / 120, pilot());
          collisions += events.filter(event => event.type === 'collision').length;
          for (const event of events.filter(event => event.type === 'collision'))
            collisionLocations.push({ leg, local: layout.stops.map(s => s.level.toLocal(event.normal)) });
          session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
        }
        expect(session.index, `leg ${leg}, at ${JSON.stringify(layout.stops[leg].level.toLocal(drive.normal))}`).toBe(
          leg + 1,
        );
        expect(drive.recoveries).toBe(0);
        expect(collisions, JSON.stringify(collisionLocations)).toBe(0);
      }
      expect(session.finished).toBe(true);
      expect(session.index).toBe(3);
      expect(drive.jumps).toBe(variant === 'short' ? 1 : 0);
      const time = session.elapsed;
      const closing = layout.connectors[2];
      const pilot = tourPilot(drive, closing.path, layout.spawnPose.normal, false);
      let parkedFor = 0;
      for (let tick = 0; tick < 120 * 60 && parkedFor < 0.6; tick++) {
        const events = drive.update(1 / 120, pilot());
        collisions += events.filter(event => event.type === 'collision').length;
        session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
        parkedFor =
          surfaceDistance(drive.normal, layout.spawnPose.normal) < 1.08 && Math.abs(drive.speed) < 1.15
            ? parkedFor + 1 / 120
            : 0;
      }
      expect(parkedFor).toBeGreaterThanOrEqual(0.6);
      expect(session.elapsed).toBe(time);
      expect(session.index).toBe(3);
      expect(collisions).toBe(0);
      expect(drive.recoveries).toBe(0);
    },
  );
});
