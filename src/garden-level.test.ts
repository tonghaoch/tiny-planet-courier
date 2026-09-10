import { Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { GARDEN_LEVEL, GardenLevel } from './garden-level';
import { PLANET_RADIUS as R, spherical, surfaceDistance } from './math';
import { PlanetWorld } from './world';

const level = new GardenLevel();
const normal = (x: number, y = 0) => level.toNormal(x, y);
const isUnder = (object: Object3D, ancestor: Object3D) => {
  for (let p: Object3D | null = object; p; p = p.parent) if (p === ancestor) return true;
  return false;
};
const meshCount = (root: Object3D) => {
  let count = 0;
  root.traverse(object => {
    if (object instanceof Mesh) count++;
  });
  return count;
};

describe('flowing Garden routes', () => {
  it('anchors the pad at the original garden and round-trips the local frame', () => {
    expect(level.destination.normal.distanceTo(spherical(48, -50))).toBeLessThan(1e-12);
    for (let x = -14; x < 4; x += 1.3)
      for (let y = -6; y < 5; y += 1.7) {
        const n = normal(x, y),
          p = level.toLocal(n.clone().multiplyScalar(3));
        expect(p.x).toBeCloseTo(x, 10);
        expect(p.y).toBeCloseTo(y, 10);
        expect(n.length()).toBeCloseTo(1, 12);
        expect(surfaceDistance(normal(0), n)).toBeCloseTo(Math.hypot(x, y), 10);
        expect(['ground', 'road']).toContain(level.sampleSurface(n).kind);
      }
    expect(level.spawnPose.normal.dot(level.spawnPose.forward)).toBeCloseTo(0, 12);
    expect(level.recoveryPose.normal.distanceTo(level.spawnPose.normal)).toBeLessThan(1e-12);
    expect(level.crossRampLip(normal(-4), normal(3))).toBeNull();
  });

  it('uses smooth centerlines, with a shorter path linking opposing bends', () => {
    for (const road of Object.values(GARDEN_LEVEL.roads)) {
      expect(road.centerline.length).toBeGreaterThan(50);
      for (let i = 1; i < road.centerline.length - 1; i++) {
        const [a, b, c] = road.centerline.slice(i - 1, i + 2);
        const before = new Vector3(b.x - a.x, b.y - a.y).normalize();
        const after = new Vector3(c.x - b.x, c.y - b.y).normalize();
        expect(Math.acos(Math.max(-1, Math.min(1, before.dot(after))))).toBeLessThan(0.4);
      }
    }
    const length = (route: Vector3[]) => route.slice(1).reduce((sum, p, i) => sum + surfaceDistance(route[i], p), 0);
    expect(length(level.innerRoute)).toBeLessThan(length(level.outerRoute));
    expect(Math.max(...GARDEN_LEVEL.innerRouteCenterline.map(p => p.y))).toBeGreaterThan(1.6);
    expect(Math.min(...GARDEN_LEVEL.innerRouteCenterline.map(p => p.y))).toBeLessThan(-1.2);
    for (const n of [...level.outerRoute, ...level.innerRoute]) {
      expect(level.sampleSurface(n)).toEqual({ kind: 'road', radius: GARDEN_LEVEL.surfaceRadii.road });
    }
  });

  it('follows either chosen branch and resets guidance at the safe approach', () => {
    const outer = level.navigation(normal(-2.8, -5.1), 'inner');
    expect(outer.route).toBe('outer');
    expect(level.toLocal(outer.target).x).toBeGreaterThan(-2.8);
    expect(level.toLocal(outer.target).y).toBeLessThan(-3.5);
    const inner = level.navigation(normal(-6.4, 1.95), 'outer');
    expect(inner.route).toBe('inner');
    expect(level.toLocal(inner.target).x).toBeGreaterThan(-6.4);
    expect(level.toLocal(inner.target).y).toBeGreaterThan(0);
    expect(level.navigation(level.recoveryPose.normal, 'inner').route).toBeNull();
    expect(level.navigation(normal(-0.5), 'outer').target.distanceTo(level.destination.normal)).toBeLessThan(1e-12);
  });
});

describe('Garden scenery and gardener handoff', () => {
  let world: PlanetWorld, original: PlanetWorld;
  beforeAll(() => {
    world = new PlanetWorld('garden');
    original = new PlanetWorld();
  });

  it('builds one garden and keeps its roads and parking approach clear of colliders', () => {
    expect(world.bayLevel).toBeNull();
    expect(world.stationLevel).toBeNull();
    expect(world.authoredLevel).toBe(world.gardenLevel);
    expect(world.destinations.map(d => d.id)).toEqual(['windmill']);
    expect(world.drivingEnvironment!.colliders).toBe(world.colliders);
    expect(original.gardenLevel).toBeNull();
    expect(original.destinations).toHaveLength(3);
    for (const road of Object.values(GARDEN_LEVEL.roads))
      for (const p of road.centerline) {
        const n = normal(p.x, p.y);
        for (const collider of world.colliders)
          expect(surfaceDistance(n, collider.normal), JSON.stringify(p)).toBeGreaterThan(
            collider.radius + road.width / 2,
          );
      }
    expect(world.colliders.filter(c => level.isInFootprint(c.normal))).toHaveLength(GARDEN_LEVEL.beds.length + 2);
    expect(world.root.getObjectByName('garden-fork-sign')).toBeDefined();
    expect(world.root.getObjectByName('bay-bakery')).toBeUndefined();
    expect(world.root.getObjectByName('station-observatory')).toBeUndefined();
  });

  it('renders the sampled spherical surface and visible flower-bed obstacles', () => {
    world.root.updateMatrixWorld(true);
    const surfaces = ['garden-land', 'garden-road'].map(name => world.root.getObjectByName(name)!);
    surfaces.forEach(surface => expect(surface).toBeInstanceOf(Mesh));
    const checks = [
      normal(-12),
      normal(-12, 2),
      normal(0),
      ...[level.outerRoute, level.innerRoute].flatMap(route => [
        route[Math.floor(route.length * 0.35)],
        route[Math.floor(route.length * 0.65)],
      ]),
    ];
    for (const n of checks) {
      const hit = new Raycaster(n.clone().multiplyScalar(R + 2), n.clone().negate(), 0, 3).intersectObjects(
        surfaces,
        false,
      )[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.length() - level.sampleSurface(n).radius)).toBeLessThan(0.006);
    }
    const solids: Object3D[] = [];
    world.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && !object.material.transparent)
        solids.push(object);
    });
    for (const bed of GARDEN_LEVEL.beds) {
      const n = normal(bed.center.x, bed.center.y);
      const hit = new Raycaster(n.clone().multiplyScalar(R + 3), n.clone().negate(), 0, 4).intersectObjects(
        solids,
        false,
      )[0];
      expect(hit.point.length()).toBeGreaterThan(R + 0.3);
    }
    expect(meshCount(world.root)).toBeLessThan(180);
  });

  it('preserves the recipient, flowers and decorative rotor after static batching', () => {
    const animation = world.root.getObjectByName('garden-recipient-animation')!;
    for (const name of ['garden-recipient', 'garden-recipient-wave', 'garden-handoff-parcel']) {
      const object = world.root.getObjectByName(name)!;
      expect(object).toBeDefined();
      expect(isUnder(object, animation)).toBe(true);
    }
    expect(world.root.getObjectByName('garden-bloom-animation')!.children).toHaveLength(3);
    expect(world.root.getObjectByName('garden-windmill-rotor')!.children).toHaveLength(5);
  });

  it('pauses and resets the handoff and blooms without allocating or mutating pooled materials', () => {
    const parcel = world.root.getObjectByName('garden-handoff-parcel')!;
    const recipient = world.root.getObjectByName('garden-recipient')!;
    const flowers = world.root.getObjectByName('garden-bloom-animation')!;
    const rotor = world.root.getObjectByName('garden-windmill-rotor')!;
    const count = meshCount(world.root);
    const originalMaterials = new Map<MeshStandardMaterial, { color: number; glow: number }>();
    original.root.traverse(object => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial)
        originalMaterials.set(object.material, {
          color: object.material.color.getHex(),
          glow: object.material.emissiveIntensity,
        });
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      world.resetDelivery();
      const initial = world.getDeliveryReactionSnapshot();
      expect(initial.bloom).toBe(0);
      expect(initial.flowersBloomed).toBe(false);
      expect(initial.parcelVisible).toBe(false);
      world.root.rotation.y = attempt * 0.1;
      const start = normal(0, -0.2).multiplyScalar(R + 0.7);
      world.startDelivery(start);
      const captured = start.clone();
      start.set(100, 100, 100);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-10);
      world.update(1.1, 1.1);
      const paused = world.getDeliveryReactionSnapshot(),
        scale = flowers.children[0].scale.clone(),
        rotation = rotor.rotation.z;
      expect(paused.bloom).toBeGreaterThan(0);
      world.update(1, 2.1, true);
      expect(world.getDeliveryReactionSnapshot()).toEqual(paused);
      expect(flowers.children[0].scale.equals(scale)).toBe(true);
      expect(rotor.rotation.z).toBeLessThan(rotation);
      world.update(5, 7.1);
      const finished = world.getDeliveryReactionSnapshot();
      expect(finished.progress).toBe(1);
      expect(finished.active).toBe(false);
      expect(finished.bloom).toBe(1);
      expect(finished.flowersBloomed).toBe(true);
      expect(
        parcel.getWorldPosition(new Vector3()).distanceTo(recipient.localToWorld(new Vector3(0.08, 0.46, 0.28))),
      ).toBeLessThan(1e-10);
      for (const plant of flowers.children) expect(plant.scale.x).toBe(1);
      expect(meshCount(world.root)).toBe(count);
      for (const [mat, before] of originalMaterials)
        expect({ color: mat.color.getHex(), glow: mat.emissiveIntensity }).toEqual(before);
      world.resetDelivery();
      expect(world.getDeliveryReactionSnapshot()).toEqual(initial);
    }
    world.root.rotation.y = 0;
    world.startDelivery(normal(0), 1);
    expect(world.getDeliveryReactionSnapshot().parcelVisible).toBe(false);
  });

  it('keeps the same blooming outcome with restrained reduced-motion feedback', () => {
    const quiet = new PlanetWorld('garden', true);
    quiet.startDelivery(normal(0).multiplyScalar(R + 0.7));
    quiet.update(1.4, 1.4);
    const arm = quiet.root.getObjectByName('garden-recipient-wave')!;
    expect(arm.rotation.z).toBeCloseTo(-0.3);
    quiet.update(0.3, 1.7);
    expect(arm.rotation.z).toBeCloseTo(-0.3);
    quiet.update(3, 4.7);
    expect(quiet.getDeliveryReactionSnapshot()).toMatchObject({
      progress: 1,
      bloom: 1,
      flowersBloomed: true,
      parcelVisible: true,
    });
  });
});
