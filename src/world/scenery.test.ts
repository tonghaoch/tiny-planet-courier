import { Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BAY_LEVEL, type BayPoint } from '../bay-level';
import { GARDEN_LEVEL } from '../garden-level';
import { STATION_LEVEL } from '../station-level';
import { type Collider, PLANET_RADIUS as R } from '../math';
import { TourLayout } from '../tour-layout';
import { PlanetWorld } from '../world';
import { buildBayScene } from './bay-scene';
import { buildStationScene } from './station-scene';
import { buildGardenScene } from './garden-scene';
import { buildOutpostScene } from './outpost-scene';
import { BEACON_LEVEL, DEPOT_LEVEL } from '../tour-outposts';
import { material, PALETTE } from './scenery-primitives';

function meshes(root: Object3D) {
  const result: Mesh[] = [];
  root.traverse(object => {
    if (object instanceof Mesh) result.push(object);
  });
  return result;
}

function districtColliders(layout: TourLayout) {
  const collider = (index: number, center: BayPoint, radius: number): Collider => ({
    normal: layout.stops[index].level.toNormal(center.x, center.y),
    radius,
  });
  return [
    collider(0, BAY_LEVEL.bakery.center, BAY_LEVEL.bakery.colliderRadius),
    ...STATION_LEVEL.obstacles.map(obstacle => collider(1, obstacle.center, obstacle.radius)),
    collider(1, STATION_LEVEL.station.center, STATION_LEVEL.station.colliderRadius),
    ...GARDEN_LEVEL.beds.map(bed => collider(2, bed.center, bed.radius)),
    collider(2, GARDEN_LEVEL.welcomeBed.center, GARDEN_LEVEL.welcomeBed.radius),
    collider(2, GARDEN_LEVEL.windmill.center, GARDEN_LEVEL.windmill.colliderRadius),
    collider(3, BEACON_LEVEL.landmark.center, BEACON_LEVEL.landmark.colliderRadius),
    collider(4, DEPOT_LEVEL.landmark.center, DEPOT_LEVEL.landmark.colliderRadius),
  ];
}

describe('world scenery extraction safeguards', () => {
  let world: PlanetWorld;
  let environmentColliders: Collider[];
  let collidersAtEnvironmentCreation: Collider[];
  beforeAll(() => {
    const createEnvironment = TourLayout.prototype.createEnvironment;
    const spy = vi.spyOn(TourLayout.prototype, 'createEnvironment').mockImplementation(function (
      this: TourLayout,
      colliders,
    ) {
      environmentColliders = colliders;
      collidersAtEnvironmentCreation = colliders.slice();
      return createEnvironment.call(this, colliders);
    });
    try {
      world = new PlanetWorld('tour');
    } finally {
      spy.mockRestore();
    }
  });

  it('appends district colliders in place between settlements and nature', () => {
    expect(collidersAtEnvironmentCreation).toEqual([]);
    expect(world.colliders).toBe(environmentColliders);
    expect(world.drivingEnvironment!.colliders).toBe(environmentColliders);
    const expected = districtColliders(world.tourLayout!);
    const first = world.colliders.findIndex(collider => collider.normal.equals(expected[0].normal));
    expect(first).toBeGreaterThan(0);
    expect(world.colliders.slice(first, first + expected.length)).toEqual(expected);
    const trees = world.colliders.slice(first + expected.length);
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.every(collider => collider.radius >= 0.22 * 0.6 && collider.radius < 0.22 * 1.4)).toBe(true);
    world.resetDelivery();
    world.update(0.1, 1);
    expect(world.colliders).toBe(environmentColliders);
    expect(world.colliders.slice(first, first + expected.length)).toEqual(expected);
  });

  it('builds into the supplied root and collider array without region wrappers', () => {
    const layout = new TourLayout();
    const root = new Group();
    const sentinel = { normal: new Vector3(0, 1, 0), radius: 0.1 };
    const colliders = [sentinel];
    const context = { root, colliders, reducedMotion: false };
    const bay = buildBayScene(layout.stops[0].level, context);
    const station = buildStationScene(layout.stops[1].level, context);
    const garden = buildGardenScene(layout.stops[2].level, context);
    const beacon = buildOutpostScene(layout.stops[3].level, context);
    const depot = buildOutpostScene(layout.stops[4].level, context);
    expect(context.colliders).toBe(colliders);
    expect(colliders[0]).toBe(sentinel);
    expect(colliders.slice(1)).toEqual(districtColliders(layout));
    expect(bay.dynamicRoots).toEqual([bay.reaction.root]);
    expect(station.dynamicRoots).toEqual([station.reaction.root]);
    expect(garden.dynamicRoots).toEqual([garden.reaction.root, garden.reaction.flowers]);
    expect(garden.rotor).toBe(root.getObjectByName('garden-windmill-rotor'));
    for (const name of [
      'bay-land',
      'bay-bakery',
      'station-land',
      'station-observatory',
      'garden-land',
      'garden-windmill',
    ])
      expect(root.getObjectByName(name)!.parent).toBe(root);
    for (const dynamic of [
      ...bay.dynamicRoots,
      ...station.dynamicRoots,
      ...garden.dynamicRoots,
      ...beacon.dynamicRoots,
      ...depot.dynamicRoots,
      garden.rotor,
    ]) {
      const batchedWorldRoot = world.root.getObjectByName(dynamic.name)!;
      expect(batchedWorldRoot.parent!.name).toBe(dynamic.parent!.name);
      // The real World must retain every animated mesh, not merely empty named groups.
      expect(meshes(batchedWorldRoot).map(mesh => [mesh.name, mesh.geometry.type])).toEqual(
        meshes(dynamic).map(mesh => [mesh.name, mesh.geometry.type]),
      );
      expect(meshes(batchedWorldRoot).length).toBeGreaterThan(0);
    }
  });

  it('shares static materials across districts while isolating animated lamps and flowers', () => {
    const pooledCream = material(PALETTE.cream);
    const creamMeshes = meshes(world.root).filter(mesh => mesh.material === pooledCream);
    expect(creamMeshes.some(mesh => mesh.parent === world.root)).toBe(true);
    for (const name of ['bay-bakery-animation', 'station-observatory-animation', 'garden-recipient-animation'])
      expect(meshes(world.root.getObjectByName(name)!).some(mesh => mesh.material === pooledCream)).toBe(true);
    const bakery = world.root.getObjectByName('bay-bakery-window-0') as Mesh;
    const station = world.root.getObjectByName('station-warm-window') as Mesh;
    const bakeryMaterial = bakery.material as MeshStandardMaterial;
    const stationMaterial = station.material as MeshStandardMaterial;
    const pooledWindow = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.2 });
    const pooledLamp = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.18 });
    expect(bakeryMaterial).not.toBe(pooledWindow);
    expect(stationMaterial).not.toBe(pooledLamp);
    const flowers = world.root.getObjectByName('garden-bloom-animation')!;
    expect(flowers.parent!.name).toBe('garden-welcome-bed');
    expect(meshes(flowers)).toHaveLength(24);
    const staticGeometry = meshes(world.root)
      .filter(mesh => mesh.parent === world.root)
      .map(mesh => mesh.geometry);
    world.resetDelivery();
    for (let i = 0; i < 3; i++) world.startDelivery(world.destinations[i].normal.clone().multiplyScalar(R + 0.6), i);
    world.update(10, 10);
    expect(bakeryMaterial.emissiveIntensity).toBe(1.2);
    expect(stationMaterial.emissiveIntensity).toBe(1.18);
    expect(pooledWindow.emissiveIntensity).toBe(0.2);
    expect(pooledLamp.emissiveIntensity).toBe(0.18);
    expect(flowers.children.map(plant => plant.scale.x)).toEqual([1, 1, 1]);
    expect(
      meshes(world.root)
        .filter(mesh => mesh.parent === world.root)
        .map(mesh => mesh.geometry),
    ).toEqual(staticGeometry);
    world.resetDelivery();
    expect(flowers.children.map(plant => plant.scale.x)).toEqual([0.3, 0.3, 0.3]);
  });
});
