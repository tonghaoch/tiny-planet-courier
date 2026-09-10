import {
  AmbientLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  RingGeometry,
  Vector3,
} from 'three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAY_LEVEL, BayLevel } from './bay-level';
import { GARDEN_LEVEL, GardenLevel } from './garden-level';
import { STATION_LEVEL, StationLevel } from './station-level';
import { PLANET_RADIUS as R, spherical, surfaceDistance } from './math';
import { PlanetWorld } from './world';
import { createTourConnectorGeometry } from './tour-world-geometry';

const objects = (root: Object3D) => {
  const result: Object3D[] = [];
  root.traverse(o => result.push(o));
  return result;
};
const meshes = (root: Object3D) => objects(root).filter((o): o is Mesh => o instanceof Mesh);
const hit = (surfaces: Object3D[], n: Vector3) =>
  new Raycaster(n.clone().multiplyScalar(R + 4), n.clone().negate(), 0, 5).intersectObjects(surfaces, false)[0];
const sidePoint = (n: Vector3, side: Vector3, distance: number) =>
  n
    .clone()
    .multiplyScalar(Math.cos(distance / R))
    .addScaledVector(side, Math.sin(distance / R))
    .normalize();
const arcDistance = (n: Vector3, a: Vector3, b: Vector3) => {
  const axis = a.clone().cross(b);
  const angle = Math.atan2(axis.length(), a.dot(b));
  if (angle < 1e-10) return surfaceDistance(n, a);
  const forward = axis.normalize().cross(a);
  const projectedAngle = Math.atan2(n.dot(forward), n.dot(a));
  let distance = Math.min(surfaceDistance(n, a), surfaceDistance(n, b));
  if (projectedAngle >= 0 && projectedAngle <= angle) {
    const closest = a
      .clone()
      .multiplyScalar(Math.cos(projectedAngle))
      .addScaledVector(forward, Math.sin(projectedAngle));
    distance = Math.min(distance, surfaceDistance(n, closest));
  }
  return distance;
};

// Deliberately instantiate the real scene, not just TourLayout's obstacle metadata.
// No jsdom/canvas/WebGL renderer is needed for geometry, transforms or reactions.
describe('three-stop Tour world', () => {
  let world: PlanetWorld;
  let original: PlanetWorld;
  let constructionErrors: unknown[][];
  beforeAll(() => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      world = new PlanetWorld('tour');
      original = new PlanetWorld();
      constructionErrors = [...errors.mock.calls];
    } finally {
      errors.mockRestore();
    }
  });
  beforeEach(() => {
    world.resetDelivery();
    world.root.rotation.set(0, 0, 0);
    world.root.updateMatrixWorld(true);
  });

  it('constructs all three reanchored districts around one base planet without canvas or batching errors', () => {
    expect(typeof document).toBe('undefined');
    expect(constructionErrors).toEqual([]);
    const layout = world.tourLayout!;
    expect(world.authoredLevel).toBeNull();
    expect(world.bayLevel).toBe(layout.stops[0].level);
    expect(world.stationLevel).toBe(layout.stops[1].level);
    expect(world.gardenLevel).toBe(layout.stops[2].level);
    expect(world.bayLevel).toBeInstanceOf(BayLevel);
    expect(world.stationLevel).toBeInstanceOf(StationLevel);
    expect(world.gardenLevel).toBeInstanceOf(GardenLevel);
    expect(world.destinations).toEqual(layout.destinations);
    expect(world.destinations.map(d => d.id)).toEqual(['bakery', 'observatory', 'windmill']);
    expect(layout.stops.map(s => s.level.definition.anchor)).toEqual([
      { latitude: 20, longitude: 0 },
      { latitude: -8, longitude: 125 },
      { latitude: 28, longitude: -115 },
    ]);
    for (const name of [
      'base-planet',
      'planet-atmosphere',
      'planet-clouds',
      'bay-bakery',
      'station-observatory',
      'garden-windmill',
    ]) {
      expect(objects(world.root).filter(o => o.name === name)).toHaveLength(1);
    }
    expect(world.root.getObjectByName('legacy-windmill')).toBeUndefined();
    expect(world.root.getObjectByName('legacy-observatory')).toBeUndefined();
    expect(objects(world.root).filter(o => o instanceof AmbientLight)).toHaveLength(1);
    expect(world.bayEnvironment).toBe(world.drivingEnvironment);
    expect(world.drivingEnvironment!.colliders).toBe(world.colliders);
    for (const stop of layout.stops) {
      expect(world.heightAt(stop.entryPose.normal)).toBe(layout.sampleSurface(stop.entryPose.normal).radius);
      expect(world.drivingEnvironment!.sampleSurface(stop.destination.normal)).toEqual(
        layout.sampleSurface(stop.destination.normal),
      );
    }
  });

  it('places every marker and recipient in its own local frame with its own pad radius', () => {
    const buildings = [BAY_LEVEL.bakery, STATION_LEVEL.station, GARDEN_LEVEL.windmill];
    const names = ['bay-bakery', 'station-observatory', 'garden-windmill'];
    world.tourLayout!.stops.forEach((stop, index) => {
      const target = world.root.getObjectByName(`${stop.id}-delivery-target`)!;
      expect(target.position.clone().normalize().distanceTo(stop.destination.normal)).toBeLessThan(1e-12);
      expect(target.position.length()).toBeCloseTo(stop.level.definition.surfaceRadii.road, 12);
      const rings = meshes(target).filter(m => m.geometry instanceof RingGeometry);
      expect(rings).toHaveLength(2);
      expect((rings[0].geometry as RingGeometry).parameters.outerRadius).toBeCloseTo(
        (0.91 * stop.level.definition.pad.radius) / BAY_LEVEL.pad.radius,
        12,
      );
      const mailbox = world.root.getObjectByName(`${stop.id}-mailbox`)!;
      expect(mailbox.position.x).toBeCloseTo(stop.level.definition.pad.radius + 0.2, 12);
      expect(world.tourLayout!.isOnConnector(mailbox.getWorldPosition(new Vector3()).normalize(), 0.17)).toBe(false);
      world.setActiveDestination(index);
      expect(rings[0].parent!.visible).toBe(true);
      const building = world.root.getObjectByName(names[index])!;
      const authored = buildings[index];
      const normal = stop.level.toNormal(authored.center.x, authored.center.y);
      expect(building.position.clone().normalize().distanceTo(normal)).toBeLessThan(1e-12);
      const forward = new Vector3(0, 0, 1).transformDirection(building.matrixWorld);
      const towardPad = stop.destination.normal
        .clone()
        .addScaledVector(normal, -stop.destination.normal.dot(normal))
        .normalize();
      expect(forward.dot(towardPad)).toBeCloseTo(1, 10);
      for (const surface of ['land', 'road'])
        expect(world.root.getObjectByName(`${stop.id}-${surface}`)).toBeInstanceOf(Mesh);
    });
    world.setActiveDestination(-1);
    for (const stop of world.tourLayout!.stops) {
      const target = world.root.getObjectByName(`${stop.id}-delivery-target`)!;
      expect(meshes(target).find(m => m.geometry instanceof RingGeometry)!.parent!.visible).toBe(false);
    }
  });

  it('copies earned recovery vectors without changing spawn, reactions or layout checkpoints', () => {
    const layout = world.tourLayout!,
      environment = world.drivingEnvironment!;
    const source = layout.stops[1].deliveredPose;
    const pose = { normal: source.normal.clone(), forward: source.forward.clone() };
    const spawn = environment.spawnPose.normal.clone();
    world.startDelivery(layout.destinations[0].normal.clone().multiplyScalar(R + 0.6));
    world.update(0.4, 1);
    const reaction = world.getDeliveryReactionSnapshot(0);
    world.setTourRecoveryPose(pose);
    expect(environment.recoveryPose).not.toBe(pose);
    expect(environment.recoveryPose.normal).not.toBe(pose.normal);
    expect(environment.recoveryPose.forward).not.toBe(pose.forward);
    pose.normal.set(99, 99, 99);
    pose.forward.set(88, 88, 88);
    expect(environment.recoveryPose.normal.equals(source.normal)).toBe(true);
    expect(environment.recoveryPose.forward.equals(source.forward)).toBe(true);
    expect(environment.spawnPose.normal.equals(spawn)).toBe(true);
    expect(world.getDeliveryReactionSnapshot(0)).toEqual(reaction);
    world.setTourRecoveryPose(layout.stops[0].entryPose);
  });

  it('dispatches by index, retains completed handoffs and captures each world-space origin defensively', () => {
    world.root.rotation.y = 0.23;
    const parcelNames = ['bay-handoff-parcel', 'station-handoff-parcel', 'garden-handoff-parcel'];
    const completed: ReturnType<PlanetWorld['getDeliveryReactionSnapshot']>[] = [];
    for (let index = 0; index < 3; index++) {
      const start = world.destinations[index].normal.clone().multiplyScalar(R + 0.6);
      const captured = start.clone();
      world.startDelivery(start, index);
      start.set(100, 100, 100);
      world.root.updateMatrixWorld(true);
      expect(
        world.root.getObjectByName(parcelNames[index])!.getWorldPosition(new Vector3()).distanceTo(captured),
      ).toBeLessThan(1e-10);
      for (let future = index + 1; future < 3; future++)
        expect(world.getDeliveryReactionSnapshot(future).progress).toBe(0);
      world.update(10, index + 1);
      const snapshot = world.getDeliveryReactionSnapshot(index);
      expect(snapshot.progress).toBe(1);
      expect(snapshot.recipientVisible).toBe(true);
      completed.push(snapshot);
      completed.forEach((previous, i) => expect(world.getDeliveryReactionSnapshot(i)).toEqual(previous));
    }
    expect(world.getDeliveryReactionSnapshot()).toEqual(world.getBayReactionSnapshot());
    const initial = completed.map(s => ({ ...s }));
    for (const invalid of [-1, 3, 0.5, NaN, Infinity]) {
      world.startDelivery(new Vector3(1, 0, 0), invalid);
      expect(world.getDeliveryReactionSnapshot(invalid)).toEqual({
        active: false,
        progress: 0,
        recipientVisible: false,
        parcelVisible: false,
      });
    }
    expect([0, 1, 2].map(i => world.getDeliveryReactionSnapshot(i))).toEqual(initial);
  });

  it('pauses all three reactions independently without pausing clouds or the garden rotor', () => {
    for (let i = 0; i < 3; i++) {
      world.startDelivery(world.destinations[i].normal.clone().multiplyScalar(R + 0.6), i);
      world.update(0.25, i);
    }
    const snapshots = [0, 1, 2].map(i => world.getDeliveryReactionSnapshot(i));
    expect(snapshots.every(s => s.active && s.progress > 0)).toBe(true);
    const parcels = ['bay-handoff-parcel', 'station-handoff-parcel', 'garden-handoff-parcel'].map(
      name => world.root.getObjectByName(name)!,
    );
    const positions = parcels.map(p => p.position.clone());
    const clouds = world.root.getObjectByName('planet-clouds')!;
    const rotor = world.root.getObjectByName('garden-windmill-rotor')!;
    const cloudRotation = clouds.rotation.y,
      rotorRotation = rotor.rotation.z;
    world.update(2, 10, true);
    expect([0, 1, 2].map(i => world.getDeliveryReactionSnapshot(i))).toEqual(snapshots);
    parcels.forEach((p, i) => expect(p.position.equals(positions[i])).toBe(true));
    expect(clouds.rotation.y).toBeGreaterThan(cloudRotation);
    expect(rotor.rotation.z).toBeLessThan(rotorRotation);
    world.update(0.2, 11);
    snapshots.forEach((s, i) => expect(world.getDeliveryReactionSnapshot(i).progress).toBeGreaterThan(s.progress));
    world.resetDelivery();
    for (let i = 0; i < 3; i++) {
      const s = world.getDeliveryReactionSnapshot(i);
      expect(s.progress).toBe(0);
      expect(s.active).toBe(false);
      // The astronomer/gardener remain outside in their accepted idle poses;
      // only the baker starts hidden behind the closed door.
      expect(s.recipientVisible).toBe(i !== 0);
      expect(s.parcelVisible).toBe(false);
    }
    expect(world.getBayReactionSnapshot().doorOpen).toBe(0);
    expect(world.getDeliveryReactionSnapshot(1).telescopeTurn).toBe(0);
    expect(world.getDeliveryReactionSnapshot(2).flowersBloomed).toBe(false);
  });

  it('keeps recipient animation groups and private lamp materials out of static batches', () => {
    const bakeryWindow = world.root.getObjectByName('bay-bakery-window-0') as Mesh;
    const stationWindow = world.root.getObjectByName('station-warm-window') as Mesh;
    expect(bakeryWindow.material).not.toBe(stationWindow.material);
    const originalMaterials = new Map<MeshStandardMaterial, number>();
    for (const m of meshes(original.root))
      if (m.material instanceof MeshStandardMaterial) originalMaterials.set(m.material, m.material.emissiveIntensity);
    for (const own of [bakeryWindow.material, stationWindow.material])
      expect(originalMaterials.has(own as MeshStandardMaterial)).toBe(false);
    for (const [name, ancestor] of [
      ['bay-door', 'bay-bakery-animation'],
      ['station-telescope', 'station-observatory-animation'],
      ['garden-recipient', 'garden-recipient-animation'],
      ['garden-bloom-animation', 'garden-welcome-bed'],
    ]) {
      const child = world.root.getObjectByName(name)!;
      expect(child).toBeDefined();
      expect(objects(world.root.getObjectByName(ancestor)!)).toContain(child);
    }
    for (let i = 0; i < 3; i++) world.startDelivery(world.destinations[i].normal.clone().multiplyScalar(R + 0.6), i);
    world.update(10, 10);
    expect((bakeryWindow.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.2);
    expect((stationWindow.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.18);
    originalMaterials.forEach((glow, mat) => expect(mat.emissiveIntensity).toBe(glow));
  });

  it('renders every shared connector at full geodesic width and sampled contact height', () => {
    const layout = world.tourLayout!;
    for (const connector of layout.connectors) {
      const road = world.root.getObjectByName(`tour-connector-${connector.from}-${connector.to}`) as Mesh;
      expect(road).toBeInstanceOf(Mesh);
      const vertices = road.geometry.getAttribute('position');
      expect(vertices.count).toBeGreaterThan(connector.path.length * 6);
      for (let i = 0; i < vertices.count; i += 39) {
        const p = new Vector3().fromBufferAttribute(vertices, i);
        expect(p.length()).toBeCloseTo(R + 0.085, 5);
        expect(layout.isOnConnector(p.normalize(), 0.00001)).toBe(true);
        expect(layout.sampleSurface(p).kind).not.toBe('water');
      }
      for (let i = 1; i < connector.path.length; i += 8) {
        const a = connector.path[i - 1],
          b = connector.path[i];
        const side = a.clone().cross(b).normalize();
        const center = a.clone().add(b).normalize();
        // Very near both boundaries, not merely centreline/metadata checks.
        for (const width of [-0.499, -0.25, 0, 0.25, 0.499]) {
          const n = sidePoint(center, side, width * connector.width);
          const contact = hit([road], n);
          expect(contact, `${connector.from}->${connector.to} sample ${i}, width ${width}`).toBeDefined();
          expect(layout.sampleSurface(n).kind).toBe('road');
          expect(Math.abs(contact.point.length() - layout.sampleSurface(n).radius)).toBeLessThan(0.002);
        }
      }
    }
  });

  it('clears the full connector corridor and all local routes against actual world colliders', () => {
    const layout = world.tourLayout!;
    let leastEdgeClearance = Infinity;
    let exactCorridorClearance = Infinity;
    for (const connector of layout.connectors) {
      for (let i = 1; i < connector.path.length; i++) {
        const a = connector.path[i - 1],
          b = connector.path[i];
        // Distance to the entire continuous arc, minus the full lane half-width,
        // also covers round joins and terminal caps between the dense probes.
        for (const collider of world.colliders)
          exactCorridorClearance = Math.min(
            exactCorridorClearance,
            arcDistance(collider.normal, a, b) - connector.width / 2 - collider.radius,
          );
        const side = a.clone().cross(b).normalize();
        for (const center of [a, a.clone().add(b).normalize(), b])
          for (const fraction of [-0.5, 0, 0.5]) {
            const n = sidePoint(center, side, fraction * connector.width);
            expect(layout.sampleSurface(n).kind).not.toBe('water');
            for (const collider of world.colliders)
              leastEdgeClearance = Math.min(leastEdgeClearance, surfaceDistance(n, collider.normal) - collider.radius);
          }
      }
    }
    // The entire rendered lane is clear of solid collider disks. Vehicle-centre
    // clearance is checked separately below; an edge is not a second centreline.
    expect(leastEdgeClearance).toBeGreaterThan(0.2);
    expect(exactCorridorClearance).toBeGreaterThan(0.2);
    for (const rocks of meshes(world.root).filter((m): m is InstancedMesh => m instanceof InstancedMesh)) {
      for (let i = 0; i < rocks.count; i++) {
        const matrix = new Matrix4();
        rocks.getMatrixAt(i, matrix);
        const position = new Vector3().setFromMatrixPosition(matrix.premultiply(rocks.matrixWorld)).normalize();
        // Instanced decorative rocks have no colliders but must still stay out.
        expect(layout.isInSceneryClearance(position, 0.35)).toBe(false);
      }
    }
    for (let index = 0; index < 3; index++)
      for (const variant of ['wide', 'short'] as const) {
        let clearance = Infinity;
        for (const n of layout.routeForLeg(index, variant))
          for (const collider of world.colliders)
            clearance = Math.min(clearance, surfaceDistance(n, collider.normal) - collider.radius);
        expect(clearance, `leg ${index} ${variant}`).toBeGreaterThan(0.34);
      }
    // Legacy props must not enter any district. These are the real authored
    // colliders, not a separately generated metadata list used as the world.
    const expectedCounts = [1, STATION_LEVEL.obstacles.length + 1, GARDEN_LEVEL.beds.length + 2];
    layout.stops.forEach((stop, index) =>
      expect(world.colliders.filter(c => stop.level.isInFootprint(c.normal))).toHaveLength(expectedCounts[index]),
    );
  });

  it('does not leave an old road or another district overlay across Bay water', () => {
    const solids = meshes(world.root).filter(
      m => m.material instanceof MeshStandardMaterial && !m.material.transparent,
    );
    for (let x = -1.8; x <= 1.8; x += 0.45)
      for (const y of [-1, 0, 1]) {
        const n = world.bayLevel!.toNormal(x, y);
        expect(world.drivingEnvironment!.sampleSurface(n).kind).toBe('water');
        const contact = hit(solids, n);
        expect(contact).toBeDefined();
        expect(contact.point.length()).toBeLessThan(R + 0.045);
      }
    for (const stop of world.tourLayout!.stops) {
      const surfaces = ['land', 'road'].map(name => world.root.getObjectByName(`${stop.id}-${name}`)!);
      const spawn = stop.level.definition.spawn.position;
      for (const n of [stop.level.toNormal(spawn.x + 0.1, spawn.y), stop.destination.normal]) {
        expect(
          Math.abs(hit(surfaces, n).point.length() - stop.level.sampleSurface(n).radius),
          `${stop.id} ${JSON.stringify(stop.level.toLocal(n))}`,
        ).toBeLessThan(0.006);
      }
      // At a local road's exact terminal edge the incoming connector cap supplies
      // support too (and avoids a float32 ray miss on that shared boundary).
      const composite = [
        ...surfaces,
        ...world.tourLayout!.connectors.map(c => world.root.getObjectByName(`tour-connector-${c.from}-${c.to}`)!),
      ];
      expect(
        Math.abs(hit(composite, stop.entryPose.normal).point.length() - world.heightAt(stop.entryPose.normal)),
      ).toBeLessThan(0.006);
    }
  });

  it('keeps repeated deliveries, celebrations and splashes bounded', () => {
    world.splash(world.bayLevel!.toNormal(0, 0));
    world.update(3, 3);
    const count = objects(world.root).length,
      meshCount = meshes(world.root).length;
    expect(meshCount).toBeLessThan(360);
    expect(count).toBeLessThan(1200);
    const triangles = meshes(world.root).reduce(
      (total, m) => total + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3,
      0,
    );
    expect(triangles).toBeLessThan(250000);
    for (let run = 0; run < 8; run++) {
      world.resetDelivery();
      for (let i = 0; i < 3; i++) {
        world.startDelivery(world.destinations[i].normal.clone().multiplyScalar(R + 0.6), i);
        world.celebrate(world.destinations[i].normal);
      }
      world.splash(world.bayLevel!.toNormal(0, 0));
      world.update(10, run);
      expect(objects(world.root)).toHaveLength(count);
      expect(meshes(world.root)).toHaveLength(meshCount);
    }
    world.resetDelivery();
  });

  it('supports reduced-motion Tour reactions without sharing state with another Tour', () => {
    const quiet = new PlanetWorld('tour', true);
    for (let i = 0; i < 3; i++) quiet.startDelivery(quiet.destinations[i].normal.clone().multiplyScalar(R + 0.6), i);
    quiet.update(0.9, 1);
    const quietState = [0, 1, 2].map(i => quiet.getDeliveryReactionSnapshot(i));
    expect(quietState.every(s => s.progress > 0 && s.recipientVisible)).toBe(true);
    quiet.update(1, 2, true);
    expect([0, 1, 2].map(i => quiet.getDeliveryReactionSnapshot(i))).toEqual(quietState);
    expect([0, 1, 2].map(i => world.getDeliveryReactionSnapshot(i).progress)).toEqual([0, 0, 0]);
    quiet.update(10, 3);
    expect([0, 1, 2].map(i => quiet.getDeliveryReactionSnapshot(i).progress)).toEqual([1, 1, 1]);
    quiet.resetDelivery();
    expect([0, 1, 2].map(i => quiet.getDeliveryReactionSnapshot(i).progress)).toEqual([0, 0, 0]);
  });
});

describe('Tour connector round joins and end caps', () => {
  it('follows a sharp piecewise great-circle bend instead of smoothing or trimming its corridor', () => {
    const level = new BayLevel();
    const path = [level.toNormal(0, 0), level.toNormal(2, 0), level.toNormal(2, 2)];
    const road = new Mesh(
      createTourConnectorGeometry({ from: 0, to: 1, width: 1.8, path }),
      new MeshStandardMaterial(),
    );
    road.updateMatrixWorld(true);
    for (const index of [0, 2]) {
      const n = path[index];
      const other = path[1];
      const outward = n.clone().sub(other).addScaledVector(n, -n.clone().sub(other).dot(n)).normalize();
      expect(hit([road], sidePoint(n, outward, 0.89)), `cap ${index}`).toBeDefined();
    }
    const center = path[1];
    const before = path[0].clone().cross(center).normalize();
    const after = center.clone().cross(path[2]).normalize();
    const turn = Math.atan2(center.dot(before.clone().cross(after)), before.dot(after));
    const outside = before.multiplyScalar(turn > 0 ? -1 : 1);
    for (let t = 0.1; t < 1; t += 0.1) {
      const side = outside.clone().applyAxisAngle(center, turn * t);
      expect(hit([road], sidePoint(center, side, 0.89))).toBeDefined();
    }
    const vertices = road.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i += 3) {
      const centroid = [0, 1, 2]
        .reduce((sum, j) => sum.add(new Vector3().fromBufferAttribute(vertices, i + j)), new Vector3())
        .divideScalar(3);
      expect(centroid.length()).toBeGreaterThan(R + 0.082);
    }
  });
});

describe('standalone constructor compatibility', () => {
  it('retains default/false worlds and all index-zero single-locale APIs', () => {
    for (const prototype of [false, true, 'bay', 'station', 'garden'] as const) {
      const world = new PlanetWorld(prototype);
      expect(world.tourLayout).toBeNull();
      if (prototype === false) {
        expect(world.authoredLevel).toBeNull();
        expect(world.drivingEnvironment).toBeNull();
        expect(world.destinations).toHaveLength(3);
        expect(world.destinations[0].normal.equals(spherical(30, 28))).toBe(true);
        expect(world.heightAt(spherical(0, 0))).toBe(R + 0.105);
        expect(world.root.getObjectByName('legacy-windmill')).toBeDefined();
        expect(world.root.getObjectByName('legacy-observatory')).toBeDefined();
      } else {
        const level = world.authoredLevel!;
        const definition = prototype === 'station' ? STATION_LEVEL : prototype === 'garden' ? GARDEN_LEVEL : BAY_LEVEL;
        expect(level.definition.anchor).toEqual(definition.anchor);
        expect(world.destinations).toEqual([level.destination]);
        expect(world.drivingEnvironment!.recoveryPose).toBe(level.recoveryPose);
        expect(world.drivingEnvironment!.spawnPose).toBe(level.spawnPose);
        const pose = world.drivingEnvironment!.recoveryPose;
        world.setTourRecoveryPose({ normal: new Vector3(1, 0, 0), forward: new Vector3(0, 1, 0) });
        expect(world.drivingEnvironment!.recoveryPose).toBe(pose);
        const before = world.getDeliveryReactionSnapshot();
        world.startDelivery(level.destination.normal, 1);
        expect(world.getDeliveryReactionSnapshot()).toEqual(before);
        world.startDelivery(level.destination.normal.clone().multiplyScalar(R + 0.6));
        world.update(10, 10);
        expect(world.getDeliveryReactionSnapshot().progress).toBe(1);
        world.resetDelivery();
        expect(world.getDeliveryReactionSnapshot()).toEqual(before);
        expect(world.root.getObjectByName(`${prototype === true ? 'bay' : prototype}-road`)).toBeInstanceOf(Mesh);
      }
      expect(objects(world.root).filter(o => o instanceof AmbientLight)).toHaveLength(0);
    }
  });
});
