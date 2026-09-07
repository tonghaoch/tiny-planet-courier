import { Group, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { BAY_LEVEL, BayLevel, inBayPolygon, type BayPoint } from './bay-level';
import { PLANET_RADIUS as R, spherical, surfaceDistance } from './math';
import { PlanetWorld } from './world';

const level = new BayLevel();
const normal = (x: number, y = 0) => level.toNormal(x, y);
const surface = (x: number, y = 0) => level.sampleSurface(normal(x, y));
const meshCount = (root: Object3D) => { let count = 0; root.traverse(object => { if (object instanceof Mesh) count++; }); return count; };
const isUnder = (object: Object3D, ancestor: Object3D) => {
  for (let p: Object3D | null = object; p; p = p.parent) if (p === ancestor) return true;
  return false;
};

function radialHit(objects: Object3D[], n: Vector3) {
  const ray = new Raycaster(n.clone().multiplyScalar(R + 2), n.clone().negate(), 0, 3);
  return ray.intersectObjects(objects, false)[0];
}

describe('authored Bay Leap surface', () => {
  it('round-trips geodesic local metres and the anchored east/north frame', () => {
    expect(level.toNormal(0, 0).distanceTo(spherical(30, 12))).toBeLessThan(1e-12);
    for (let x = -11; x <= 12; x += 1.3) for (let y = -6; y <= 9; y += 1.7) {
      const n = normal(x, y), p = level.toLocal(n.clone().multiplyScalar(3));
      expect(p.x).toBeCloseTo(x, 10); expect(p.y).toBeCloseTo(y, 10);
      expect(n.length()).toBeCloseTo(1, 12);
      expect(surfaceDistance(normal(0), n)).toBeCloseTo(Math.hypot(x, y), 10);
    }
    expect(normal(0, 0.1).y).toBeGreaterThan(normal(0).y);
    expect(level.isInFootprint(normal(0).negate())).toBe(false);
    expect(level.sampleSurface(normal(0).negate()).kind).toBe('ground');
    for (const pose of [level.spawnPose, level.recoveryPose]) {
      expect(pose.normal.dot(pose.forward)).toBeCloseTo(0, 12);
      expect(pose.forward.length()).toBeCloseTo(1, 12);
      const p = level.toLocal(pose.normal.clone().addScaledVector(pose.forward, 0.0001).normalize());
      expect(p.x).toBeGreaterThan(BAY_LEVEL.spawn.position.x);
    }
  });

  it('owns one closed water polygon, with an open southern mouth and no hidden bridge', () => {
    expect(BAY_LEVEL.waterPolygon[0].y).toBe(-6);
    expect(BAY_LEVEL.waterPolygon[1].y).toBe(-6);
    for (const p of BAY_LEVEL.waterPolygon) {
      expect(level.isInFootprint(normal(p.x, p.y))).toBe(true);
      expect(surface(p.x, p.y)).toEqual({ kind: 'water', radius: R + 0.025 });
    }
    for (let i = 0; i < BAY_LEVEL.waterPolygon.length; i++) {
      const a = BAY_LEVEL.waterPolygon[i], b = BAY_LEVEL.waterPolygon[(i + 1) % BAY_LEVEL.waterPolygon.length];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = -(b.y - a.y) / length * 0.025, dy = (b.x - a.x) / length * 0.025;
      expect(surface(x, y).kind).toBe('water');
      expect(surface(x + dx, y + dy).kind).toBe('water');
      expect(surface(x - dx, y - dy).kind).not.toBe('water');
    }
    for (let x = -2.29; x <= 2.29; x += 0.13) expect(surface(x).kind).toBe('water');
    expect(surface(-2.31).kind).toBe('ground'); expect(surface(2.31).kind).toBe('ground');
    expect(surface(0, 3.5).kind).toBe('ground');
    expect(level.isInFootprint(normal(-11.1, 2))).toBe(false);
    expect(level.isInFootprint(normal(12.1, 2))).toBe(false);
  });

  it('uses the rendered road outlines for a wide supported safe route', () => {
    expect(level.safeRoute.length).toBeGreaterThan(100);
    for (const n of level.safeRoute) {
      expect(level.sampleSurface(n).kind).toBe('road');
      expect(level.sampleSurface(n).radius).toBe(R + 0.085);
      const p = level.toLocal(n);
      expect(level.distanceToShore(p.x, p.y)).toBeGreaterThan(1.7);
    }
    const points = BAY_LEVEL.roads.safe.centerline;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let step = 1; step < 10; step++) for (const side of [-0.85, 0, 0.85]) {
        const p = { x: a.x + (b.x - a.x) * step / 10 - (b.y - a.y) * side / length, y: a.y + (b.y - a.y) * step / 10 + (b.x - a.x) * side / length };
        expect(inBayPolygon(p, BAY_LEVEL.roads.safe.polygon)).toBe(true);
        expect(surface(p.x, p.y).kind).toBe('road');
      }
    }
    for (const p of [BAY_LEVEL.spawn.position, BAY_LEVEL.recovery.position, BAY_LEVEL.pad.center]) expect(surface(p.x, p.y).kind).toBe('road');
    const landing = BAY_LEVEL.landingRegion;
    for (const x of [landing.minX, (landing.minX + landing.maxX) / 2, landing.maxX]) for (const y of [landing.minY, 0, landing.maxY]) expect(surface(x, y).kind).not.toBe('water');
  });

  it('shares the quadratic ramp height, slope and aligned lip crossing', () => {
    const ramp = BAY_LEVEL.ramp;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const y of [-0.9, 0, 0.9]) {
      const x = ramp.base.x + ramp.length * t, sample = surface(x, y);
      expect(sample.kind).toBe('ramp');
      expect(sample.rampProgress).toBeCloseTo(t, 10);
      expect(sample.radius).toBeCloseTo(R + 0.085 + 0.65 * t * t, 10);
      expect(sample.rampSlope).toBeCloseTo(1.3 * t / 2.2, 10);
      expect(sample.rampForward!.dot(normal(x, y))).toBeCloseTo(0, 10);
    }
    const crossing = level.crossRampLip(normal(-2.82, 0.1), normal(-2.5, 0.12))!;
    expect(crossing).not.toBeNull();
    expect(level.toLocal(crossing.normal).x).toBeCloseTo(ramp.lip.x, 10);
    expect(level.toLocal(crossing.normal).y).toBeCloseTo(0.1075, 10);
    expect(crossing.fraction).toBeCloseTo(0.375, 10);
    expect(crossing.radius).toBeCloseTo(R + 0.735, 10);
    expect(crossing.pitch * 180 / Math.PI).toBeCloseTo(30.57922687, 5);
    expect(crossing.forward.dot(crossing.normal)).toBeCloseTo(0, 10);
    expect(crossing.forward.dot(surface(ramp.lip.x, 0.1075).rampForward!)).toBeCloseTo(1, 10);
    expect(level.crossRampLip(normal(-2.9, 0.9), normal(-2.6, 0.9))).not.toBeNull();
    expect(level.crossRampLip(normal(-2.6), normal(-2.9))).toBeNull(); // reverse
    expect(level.crossRampLip(normal(-3.2, 0.8), normal(-3.2, 1.1))).toBeNull(); // side exit
    expect(level.crossRampLip(normal(-2.85, 1.2), normal(-2.6, 0))).toBeNull(); // side entry
    expect(level.crossRampLip(normal(-2.85, 0.8), normal(-2.6, 1.4))).toBeNull(); // misses lip width
    expect(level.crossRampLip(normal(-6), normal(-2.6))).toBeNull(); // never on ramp
    expect(level.crossRampLip(normal(-2.7), normal(-2.6))).toBeNull(); // no repeated launch
    expect(level.crossRampLip(normal(-2.8), normal(-2.7))).not.toBeNull(); // exact landing on lip
  });
});

describe('opt-in bay scenery and bakery reaction (without a browser canvas)', () => {
  let original: PlanetWorld, world: PlanetWorld;
  beforeAll(() => { original = new PlanetWorld(); world = new PlanetWorld(true); });

  it('keeps the original three destinations and baseline while opting into exactly one bakery', () => {
    expect(original.bayLevel).toBeNull(); expect(original.bayEnvironment).toBeNull();
    expect(original.destinations.map(d => d.id)).toEqual(['bakery', 'observatory', 'windmill']);
    expect(original.destinations[0].normal.distanceTo(spherical(30, 28))).toBeLessThan(1e-12);
    expect(world.destinations).toEqual([world.bayLevel!.destination]);
    expect(world.destinations[0].name).toBe('Sunrise Bakery');
    expect(world.destinations[0].parcel).toBe('A bag of warm croissants');
    for (const p of [normal(0), normal(-4), normal(5), normal(-6, 2.2)]) {
      expect(world.heightAt(p)).toBe(world.bayLevel!.sampleSurface(p).radius);
    }
    expect(original.heightAt(normal(0))).toBe(R + 0.105);
    const environment = world.bayEnvironment!;
    expect(environment.colliders).toBe(world.colliders);
    expect(environment.spawnPose).toBe(world.bayLevel!.spawnPose);
    expect(environment.recoveryPose).toBe(world.bayLevel!.recoveryPose);
    const { sampleSurface, crossRampLip } = environment;
    expect(sampleSurface(normal(0)).kind).toBe('water');
    expect(crossRampLip(normal(-2.8), normal(-2.6))).not.toBeNull();
    expect(world.root.getObjectByName('bay-fork-sign')).toBeDefined();
  });

  it('clears both authored routes, spawn/recovery and pad of legacy colliders', () => {
    const points = [...world.bayLevel!.safeRoute, ...world.bayLevel!.jumpRoute, world.bayLevel!.recoveryPose.normal];
    for (const n of points) for (const collider of world.colliders) expect(surfaceDistance(n, collider.normal)).toBeGreaterThan(collider.radius + 0.34);
    const inside = world.colliders.filter(c => world.bayLevel!.isInFootprint(c.normal));
    expect(inside).toHaveLength(1); // Only the deliberately placed bakery.
    expect(inside[0].normal.distanceTo(normal(BAY_LEVEL.bakery.center.x, BAY_LEVEL.bakery.center.y))).toBeLessThan(1e-12);
  });

  it('renders subdivided spherical polygons at sampled heights, without buried chords or old roads', () => {
    world.root.updateMatrixWorld(true);
    const surfaces = ['bay-land', 'bay-water', 'bay-road', 'bay-ramp-deck'].map(name => world.root.getObjectByName(name)!);
    for (const object of surfaces) expect(object).toBeInstanceOf(Mesh);
    const water = surfaces[1] as Mesh;
    const vertices = water.geometry.getAttribute('position');
    expect(vertices.count).toBeGreaterThan(100);
    expect(vertices.count).toBeLessThan(30000);
    for (let i = 0; i < vertices.count; i += 3) {
      const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(vertices, i + j));
      expect(points[0].length()).toBeCloseTo(BAY_LEVEL.surfaceRadii.water, 5);
      expect(points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3).length()).toBeGreaterThan(R + 0.019);
    }
    const checks: BayPoint[] = [
      { x: -8, y: 0 }, { x: -6, y: 2.2 }, { x: 0, y: 5.3 }, { x: -4.4, y: 0 },
      { x: -3.8, y: 0.3 }, { x: -2.72, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: -2 },
      { x: 3.3, y: 1.5 }, { x: 8.9, y: 0 }, { x: -8, y: 6 },
    ];
    for (const p of checks) {
      const hit = radialHit(surfaces, normal(p.x, p.y));
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.length() - surface(p.x, p.y).radius)).toBeLessThan(0.006);
    }
    const solids: Object3D[] = [];
    world.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && !object.material.transparent) solids.push(object);
    });
    for (let x = -1.9; x < 2; x += 0.4) for (const y of [-1, 0, 1]) {
      const hit = radialHit(solids, normal(x, y));
      expect(hit).toBeDefined();
      expect(hit.point.length()).toBeLessThan(R + 0.045); // No old road, stripe or terrain bridge.
    }
    const deck = surfaces[3] as Mesh;
    expect(deck.geometry.getAttribute('position').count).toBe(25 * 9);
    expect(deck.geometry.index!.count).toBe(24 * 8 * 6);
    expect(meshCount(world.root)).toBeLessThan(180);
  });

  it('keeps all dynamic models attached after batching, oriented towards an actual recessed opening', () => {
    const bakery = world.root.getObjectByName('bay-bakery')!;
    const animation = world.root.getObjectByName('bay-bakery-animation')!;
    for (const name of ['bay-door', 'bay-recipient', 'bay-recipient-wave', 'bay-handoff-parcel', 'bay-bakery-window-0', 'bay-bakery-window-1']) {
      const object = world.root.getObjectByName(name)!;
      expect(object).toBeDefined(); expect(isUnder(object, animation)).toBe(true);
    }
    world.root.updateMatrixWorld(true);
    const front = new Vector3(0, 0, 1).transformDirection(bakery.matrixWorld);
    const n = bakery.position.clone().normalize();
    const toPad = world.destinations[0].normal.clone().addScaledVector(n, -world.destinations[0].normal.dot(n)).normalize();
    expect(front.dot(toPad)).toBeCloseTo(1, 10);
    const recipient = world.root.getObjectByName('bay-recipient')!;
    const parcel = world.root.getObjectByName('bay-handoff-parcel')!;
    const solids: Object3D[] = [];
    world.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && !isUnder(object, recipient) && !isUnder(object, parcel)) solids.push(object);
    });
    const openingRay = new Raycaster(bakery.localToWorld(new Vector3(0, 0.5, 2)), front.clone().negate(), 0, 1.95);
    world.resetBayDelivery(); world.root.updateMatrixWorld(true);
    expect(openingRay.intersectObjects(solids, false)[0]?.object.name).toBe('bay-door');
    world.startBayDelivery(normal(8.9).multiplyScalar(R + 0.6)); world.update(1, 1); world.root.updateMatrixWorld(true);
    expect(openingRay.intersectObjects(solids, false)).toHaveLength(0);
    world.resetBayDelivery();
  });

  it('captures a WORLD parcel start, freezes only the reaction when paused, and resets every replay', () => {
    const animation = world.root.getObjectByName('bay-bakery-animation')!;
    const parcel = world.root.getObjectByName('bay-handoff-parcel')!;
    const door = world.root.getObjectByName('bay-door-hinge')!;
    const recipient = world.root.getObjectByName('bay-recipient')!;
    const arm = world.root.getObjectByName('bay-recipient-wave')!;
    const count = meshCount(world.root);
    const windows = [0, 1].map(i => (world.root.getObjectByName(`bay-bakery-window-${i}`) as Mesh).material as MeshStandardMaterial);
    const legacyWindows = new Set<MeshStandardMaterial>();
    original.root.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.emissive.getHex() === 0xffc56a) legacyWindows.add(object.material); });
    expect(legacyWindows.size).toBeGreaterThan(0);
    expect(windows[0]).toBe(windows[1]);
    for (const material of legacyWindows) expect(material).not.toBe(windows[0]);

    for (let attempt = 0; attempt < 3; attempt++) {
      world.resetBayDelivery();
      const initial = world.getBayReactionSnapshot();
      expect(initial).toEqual({ active: false, progress: 0, doorOpen: 0, recipientVisible: false, parcelVisible: false, windowGlow: 0.2 });
      // Also exercise non-identity scene ancestry: input is never treated as bakery-local.
      world.root.rotation.y = attempt * 0.1;
      const start = normal(8.9, -0.2).multiplyScalar(R + 0.6);
      world.startBayDelivery(start);
      const captured = start.clone(); start.set(100, 100, 100);
      world.root.updateMatrixWorld(true);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-10);
      world.update(0.3, 1);
      const paused = world.getBayReactionSnapshot();
      const position = parcel.position.clone(), hinge = door.rotation.clone(), wave = arm.rotation.clone();
      const clouds = world.root.children.find(object => object instanceof Group && object.children.length === 6 && object.children.every(child => child.children.length === 5))!;
      expect(clouds).toBeDefined();
      const ambientRotation = clouds.rotation.y;
      world.update(1.7, 10, true);
      expect(world.getBayReactionSnapshot()).toEqual(paused);
      expect(parcel.position.equals(position)).toBe(true);
      expect(door.rotation.equals(hinge)).toBe(true); expect(arm.rotation.equals(wave)).toBe(true);
      expect(clouds.rotation.y).toBeGreaterThan(ambientRotation);
      world.update(0.9, 20);
      expect(world.getBayReactionSnapshot().progress).toBeCloseTo(1.2 / BAY_LEVEL.reactionDuration);
      expect(world.getBayReactionSnapshot().doorOpen).toBe(1);
      expect(world.getBayReactionSnapshot().recipientVisible).toBe(true);
      world.update(5, 25);
      expect(world.getBayReactionSnapshot()).toEqual({ active: false, progress: 1, doorOpen: 1, recipientVisible: true, parcelVisible: true, windowGlow: 1.2 });
      world.root.updateMatrixWorld(true);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(recipient.localToWorld(new Vector3(0.08, 0.46, 0.28)))).toBeLessThan(1e-10);
      for (const material of legacyWindows) expect(material.emissiveIntensity).toBe(0.2);
      expect(meshCount(world.root)).toBe(count);
      expect(isUnder(parcel, animation)).toBe(true);
      world.resetBayDelivery();
      expect(world.getBayReactionSnapshot()).toEqual(initial);
      expect(door.rotation.y).toBe(0); expect(arm.rotation.z).toBe(0);
      expect(recipient.position.toArray()).toEqual([0, 0.06, 0.10]);
      expect(parcel.position.length()).toBe(0); expect(parcel.rotation.y).toBe(0);
    }
    world.root.rotation.y = 0; world.root.updateMatrixWorld(true);
  });

  it('reuses a bounded splash pool and leaves legacy celebration unchanged', () => {
    const before = meshCount(world.root);
    for (let i = 0; i < 10; i++) world.splash(normal(0));
    expect(meshCount(world.root)).toBe(before + 20);
    world.update(2, 30);
    let visible = 0;
    world.root.traverse(object => { if (object.name === 'bay-splash-particle' && object.visible) visible++; });
    expect(visible).toBe(0);
    world.splash(normal(0)); expect(meshCount(world.root)).toBe(before + 20);
    const legacyCount = meshCount(original.root);
    original.splash(normal(0)); original.startBayDelivery(normal(0)); original.resetBayDelivery();
    expect(meshCount(original.root)).toBe(legacyCount);
    original.celebrate(original.destinations[0].normal);
    expect(meshCount(original.root)).toBe(legacyCount + 26);
    original.update(3, 3);
    expect(meshCount(original.root)).toBe(legacyCount);
  });
});
