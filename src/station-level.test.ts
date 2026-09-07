import { Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { STATION_LEVEL, StationLevel } from './station-level';
import { PLANET_RADIUS as R, spherical, surfaceDistance } from './math';
import { PlanetWorld } from './world';

const level = new StationLevel();
const normal = (x: number, y = 0) => level.toNormal(x, y);
const isUnder = (object: Object3D, ancestor: Object3D) => {
  for (let p: Object3D | null = object; p; p = p.parent) if (p === ancestor) return true;
  return false;
};
const meshCount = (root: Object3D) => { let count = 0; root.traverse(object => { if (object instanceof Mesh) count++; }); return count; };

describe('authored Station ground routes', () => {
  it('anchors the delivery at the original station and round-trips its own local frame', () => {
    expect(level.destination.normal.distanceTo(spherical(-10, 85))).toBeLessThan(1e-12);
    for (let x = -13; x <= 4; x += 1.3) for (let y = -6.6; y <= 5; y += 1.7) {
      const n = normal(x, y), p = level.toLocal(n.clone().multiplyScalar(4));
      expect(p.x).toBeCloseTo(x, 10); expect(p.y).toBeCloseTo(y, 10);
      expect(n.length()).toBeCloseTo(1, 12);
      expect(surfaceDistance(normal(0), n)).toBeCloseTo(Math.hypot(x, y), 10);
      expect(level.sampleSurface(n).kind).not.toBe('water');
      expect(level.sampleSurface(n).kind).not.toBe('ramp');
    }
    expect(level.spawnPose.normal.dot(level.spawnPose.forward)).toBeCloseTo(0, 12);
    expect(level.recoveryPose.normal.distanceTo(level.spawnPose.normal)).toBeLessThan(1e-12);
    expect(level.crossRampLip(normal(-4), normal(3))).toBeNull();
  });

  it('supports both rendered road centerlines without introducing flight or water rules', () => {
    for (const n of [...level.outerRoute, ...level.innerRoute, level.recoveryPose.normal]) {
      expect(level.sampleSurface(n)).toEqual({ kind: 'road', radius: STATION_LEVEL.surfaceRadii.road });
    }
    expect(level.sampleSurface(normal(-11, 3))).toEqual({ kind: 'ground', radius: STATION_LEVEL.surfaceRadii.ground });
  });

  it('guides the selected branch, permits switching, and clears the choice at recovery', () => {
    const outer = level.navigation(normal(-2.5, -4.8), 'inner');
    expect(outer.route).toBe('outer');
    expect(level.toLocal(outer.target).x).toBeGreaterThan(-2.5);
    expect(level.toLocal(outer.target).y).toBeLessThan(-3.5);
    const inner = level.navigation(normal(-5.5, 1.7), 'outer');
    expect(inner.route).toBe('inner');
    expect(level.toLocal(inner.target).x).toBeGreaterThan(-5.5);
    expect(level.toLocal(inner.target).y).toBeGreaterThan(0);
    expect(level.navigation(level.recoveryPose.normal, 'outer').route).toBeNull();
    expect(level.navigation(normal(-0.5), 'inner').target).toBe(level.destination.normal);
  });
});

describe('Station world and delivery feedback', () => {
  let world: PlanetWorld, original: PlanetWorld;
  beforeAll(() => { world = new PlanetWorld('station'); original = new PlanetWorld(); });

  it('selects one station and clears legacy colliders from both drivable paths', () => {
    expect(world.bayLevel).toBeNull();
    expect(world.destinations.map(d => d.id)).toEqual(['observatory']);
    expect(world.authoredLevel).toBe(world.stationLevel);
    expect(world.drivingEnvironment!.colliders).toBe(world.colliders);
    expect(original.stationLevel).toBeNull();
    expect(original.destinations).toHaveLength(3);
    for (const n of [...level.outerRoute, ...level.innerRoute, level.recoveryPose.normal]) {
      for (const collider of world.colliders) expect(surfaceDistance(n, collider.normal)).toBeGreaterThan(collider.radius + 0.34);
    }
    expect(world.colliders.filter(c => level.isInFootprint(c.normal))).toHaveLength(STATION_LEVEL.obstacles.length + 1);
    expect(world.root.getObjectByName('bay-bakery')).toBeUndefined();
    expect(world.root.getObjectByName('station-fork-sign')).toBeDefined();
  });

  it('renders visible contact surfaces at sampled heights and solid authored obstacles', () => {
    world.root.updateMatrixWorld(true);
    const surfaces = ['station-land', 'station-road'].map(name => world.root.getObjectByName(name)!);
    for (const surface of surfaces) expect(surface).toBeInstanceOf(Mesh);
    const checks = [{ x: -10, y: 0 }, { x: -5.5, y: 1.7 }, { x: -2.5, y: -4.8 }, { x: 0, y: 0 }, { x: -11, y: 3 }];
    for (const p of checks) {
      const n = normal(p.x, p.y);
      const hit = new Raycaster(n.clone().multiplyScalar(R + 2), n.clone().negate(), 0, 3).intersectObjects(surfaces, false)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.length() - level.sampleSurface(n).radius)).toBeLessThan(0.006);
    }
    const solids: Object3D[] = [];
    world.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && !object.material.transparent) solids.push(object);
    });
    for (const obstacle of STATION_LEVEL.obstacles) {
      const n = normal(obstacle.center.x, obstacle.center.y);
      const hit = new Raycaster(n.clone().multiplyScalar(R + 3), n.clone().negate(), 0, 4).intersectObjects(solids, false)[0];
      expect(hit.point.length()).toBeGreaterThan(R + 0.3);
    }
    expect(meshCount(world.root)).toBeLessThan(180);
  });

  it('keeps the telescope, recipient and parcel dynamic after batching with isolated lamp materials', () => {
    const animation = world.root.getObjectByName('station-observatory-animation')!;
    for (const name of ['station-telescope', 'station-recipient', 'station-recipient-wave', 'station-handoff-parcel', 'station-warm-window']) {
      const object = world.root.getObjectByName(name)!;
      expect(object).toBeDefined(); expect(isUnder(object, animation)).toBe(true);
    }
    const lamp = (world.root.getObjectByName('station-warm-window') as Mesh).material as MeshStandardMaterial;
    original.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) expect(object.material).not.toBe(lamp);
    });
  });

  it('captures the world parcel pose, freezes on pause and fully resets without allocating new objects', () => {
    const parcel = world.root.getObjectByName('station-handoff-parcel')!;
    const recipient = world.root.getObjectByName('station-recipient')!;
    const count = meshCount(world.root);
    for (let attempt = 0; attempt < 3; attempt++) {
      world.resetDelivery();
      const initial = world.getDeliveryReactionSnapshot();
      expect(initial.progress).toBe(0); expect(initial.parcelVisible).toBe(false);
      world.root.rotation.y = attempt * 0.1;
      const start = normal(0, -0.2).multiplyScalar(R + 0.7);
      world.startDelivery(start);
      const captured = start.clone(); start.set(100, 100, 100);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-10);
      world.update(0.4, 1);
      const paused = world.getDeliveryReactionSnapshot(), position = parcel.position.clone();
      world.update(2, 3, true);
      expect(world.getDeliveryReactionSnapshot()).toEqual(paused);
      expect(parcel.position.equals(position)).toBe(true);
      world.update(5, 8);
      const finished = world.getDeliveryReactionSnapshot();
      expect(finished.progress).toBe(1); expect(finished.active).toBe(false);
      expect(finished.windowGlow).toBeCloseTo(1.18);
      expect('telescopeTurn' in finished && finished.telescopeTurn).toBeCloseTo(0.75);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(recipient.localToWorld(new Vector3(0.08, 0.46, 0.28)))).toBeLessThan(1e-10);
      expect(meshCount(world.root)).toBe(count);
      world.resetDelivery();
      expect(world.getDeliveryReactionSnapshot()).toEqual(initial);
    }
    world.root.rotation.y = 0;
    world.startDelivery(normal(0), 1);
    expect(world.getDeliveryReactionSnapshot().progress).toBe(0);
    expect(world.getDeliveryReactionSnapshot().parcelVisible).toBe(false);
  });

  it('keeps the same handoff outcome with reduced motion', () => {
    const quiet = new PlanetWorld('station', true);
    quiet.startDelivery(normal(0).multiplyScalar(R + 0.7));
    quiet.update(3, 3);
    const result = quiet.getDeliveryReactionSnapshot();
    expect(result.progress).toBe(1);
    expect('telescopeTurn' in result && result.telescopeTurn).toBeCloseTo(0.18);
    expect(result.parcelVisible).toBe(true);
  });
});
