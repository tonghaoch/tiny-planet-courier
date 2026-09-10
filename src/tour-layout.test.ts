import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { AuthoredLevel, densify, point } from './authored-level';
import { BAY_LEVEL, BayLevel } from './bay-level';
import { STATION_LEVEL, StationLevel } from './station-level';
import { GARDEN_LEVEL, GardenLevel } from './garden-level';
import { BayDrive } from './bay-driving';
import { TourLayout } from './tour-layout';
import { TourSession } from './tour-session';
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
    expect(layout.stops.map(s => s.level.definition.anchor)).toEqual([
      { latitude: 20, longitude: 0 },
      { latitude: -8, longitude: 125 },
      { latitude: 28, longitude: -115 },
    ]);
    expect(JSON.stringify([BAY_LEVEL, STATION_LEVEL, GARDEN_LEVEL])).toBe(before);
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
    const boundaries = layout.stops.map(({ level }) => {
      const polygon = level.definition.footprintPolygon;
      return level.route([...polygon, polygon[0]]);
    });
    let gap = Infinity;
    layout.stops.forEach(({ level }, index) => {
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

describe('continuous Tour routes using the accepted controller and real inputs', () => {
  it.each(['wide', 'short'] as const)(
    'drives all %s legs and the closing connector without teleport or recovery',
    variant => {
      const layout = new TourLayout();
      const environment = layout.createEnvironment(authoredColliders(layout));
      const drive = new BayDrive(environment);
      const session = new TourSession(layout);
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
          session.updateLocation(drive.normal, drive.phase === 'grounded');
          session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
          environment.recoveryPose = session.checkpoint.pose;
        }
        expect(session.index, `leg ${leg}, at ${JSON.stringify(layout.stops[leg].level.toLocal(drive.normal))}`).toBe(
          leg + 1,
        );
        expect(drive.recoveries).toBe(0);
        expect(collisions, JSON.stringify(collisionLocations)).toBe(0);
      }
      expect(session.finished).toBe(true);
      expect(session.splits).toHaveLength(3);
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
