import { InstancedMesh, Mesh, Object3D, RingGeometry, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTourPlan } from '../tour-itinerary';
import { PlanetWorld } from '../world';

function objects(root: Object3D) {
  const result: Object3D[] = [];
  root.traverse(object => result.push(object));
  return result;
}

function metrics(world: PlanetWorld) {
  const all = objects(world.root);
  const meshes = all.filter((object): object is Mesh => object instanceof Mesh);
  return {
    objects: all.length,
    meshes: meshes.length,
    triangles: meshes.reduce(
      (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3,
      0,
    ),
    instanceExpandedTriangles: meshes.reduce(
      (sum, mesh) =>
        sum +
        ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3) *
          (mesh instanceof InstancedMesh ? mesh.count : 1),
      0,
    ),
    colliders: world.colliders.length,
  };
}

describe('physical location dispatch and repeated Tour visits', () => {
  let world: PlanetWorld;
  beforeAll(() => {
    world = new PlanetWorld('tour');
  });

  it('dispatches all ten occurrences by physical ID, retaining other completed reactions and fixed scene objects', () => {
    world.resetDelivery();
    console.info('Five-location constructed World metrics:', JSON.stringify(metrics(world)));
    world.splash(world.bayLevel!.toNormal(0, 0));
    world.update(3, 3);
    const initialMetrics = metrics(world);
    console.info('World with warmed fixed splash pool:', JSON.stringify(initialMetrics));
    expect(initialMetrics.meshes).toBeLessThan(360);
    expect(initialMetrics.objects).toBeLessThan(1200);
    expect(initialMetrics.triangles).toBeLessThan(250000);
    expect(initialMetrics.instanceExpandedTriangles).toBeLessThan(250000);
    const stableObjects = objects(world.root);
    for (let run = 0; run < 8; run++) {
      world.resetDelivery();
      world.splash(world.bayLevel!.toNormal(0, 0));
      const completed = new Map<string, ReturnType<PlanetWorld['getLocationReactionSnapshot']>>();
      for (const id of createTourPlan(run % 2).order) {
        const stop = world.tourLayout!.location(id);
        const index = world.tourLayout!.stops.indexOf(stop);
        world.setActiveLocation(id);
        for (const other of world.tourLayout!.stops) {
          const target = world.root.getObjectByName(`${other.id}-delivery-target`)!;
          const ring = objects(target).find((o): o is Mesh => o instanceof Mesh && o.geometry instanceof RingGeometry)!;
          expect(ring.parent!.visible).toBe(other.id === id);
        }
        const origin = stop.destination.normal
          .clone()
          .multiplyScalar(15.7)
          .add(new Vector3(0.05, 0.1, -0.08));
        const captured = origin.clone();
        world.startLocationDelivery(origin, id);
        world.celebrate(stop.destination.normal);
        origin.set(100, 100, 100);
        expect(
          world.root.getObjectByName(`${id}-handoff-parcel`)!.getWorldPosition(new Vector3()).distanceTo(captured),
        ).toBeLessThan(1e-10);
        expect(world.getLocationReactionSnapshot(id).progress).toBe(0);
        completed.delete(id);
        for (const other of world.tourLayout!.stops) {
          if (completed.has(other.id))
            expect(world.getLocationReactionSnapshot(other.id)).toEqual(completed.get(other.id));
        }
        world.update(0.4, run);
        const paused = world.tourLayout!.stops.map(stop => world.getLocationReactionSnapshot(stop.id));
        world.update(1, run, true);
        expect(world.tourLayout!.stops.map(stop => world.getLocationReactionSnapshot(stop.id))).toEqual(paused);
        world.update(10, run);
        const finished = world.getLocationReactionSnapshot(id);
        expect(finished.progress).toBe(1);
        expect(finished.recipientVisible).toBe(true);
        expect(world.getDeliveryReactionSnapshot(index)).toEqual(finished);
        if (id !== 'bay') expect(finished.destination).toBe(stop.destination.id);
        completed.set(id, finished);
        expect(objects(world.root)).toEqual(stableObjects);
      }
      expect(completed.size).toBe(5);
    }
    world.setActiveLocation(null);
    for (const stop of world.tourLayout!.stops) {
      const target = world.root.getObjectByName(`${stop.id}-delivery-target`)!;
      expect(
        objects(target).find((o): o is Mesh => o instanceof Mesh && o.geometry instanceof RingGeometry)!.parent!
          .visible,
      ).toBe(false);
    }
    world.resetDelivery();
    expect(world.tourLayout!.stops.map(stop => world.getLocationReactionSnapshot(stop.id).progress)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(metrics(world)).toEqual(initialMetrics);
    console.info('After 80 location deliveries and eight resets:', JSON.stringify(metrics(world)));
  });

  it('pauses/resets reduced-motion reactions at all five sites without cross-world state', () => {
    const quiet = new PlanetWorld('tour', true);
    world.resetDelivery();
    for (const stop of quiet.tourLayout!.stops)
      quiet.startLocationDelivery(stop.destination.normal.clone().multiplyScalar(15.6), stop.id);
    quiet.update(0.9, 1);
    const state = quiet.tourLayout!.stops.map(stop => quiet.getLocationReactionSnapshot(stop.id));
    expect(state.every(snapshot => snapshot.progress > 0 && snapshot.recipientVisible)).toBe(true);
    quiet.update(10, 2, true);
    expect(quiet.tourLayout!.stops.map(stop => quiet.getLocationReactionSnapshot(stop.id))).toEqual(state);
    expect(world.tourLayout!.stops.map(stop => world.getLocationReactionSnapshot(stop.id).progress)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    quiet.update(10, 3);
    expect(quiet.tourLayout!.stops.map(stop => quiet.getLocationReactionSnapshot(stop.id).progress)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    quiet.resetDelivery();
    expect(quiet.tourLayout!.stops.map(stop => quiet.getLocationReactionSnapshot(stop.id).parcelVisible)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('clearly rejects Tour-only wrappers in every standalone constructor', () => {
    for (const mode of [false, true, 'bay', 'station', 'garden'] as const) {
      const standalone = new PlanetWorld(mode);
      expect(standalone.beaconLevel).toBeNull();
      expect(standalone.depotLevel).toBeNull();
      expect(() => standalone.setActiveLocation('bay')).toThrow('Location APIs require a Tour world');
      expect(() => standalone.setActiveLocation(null)).toThrow('Location APIs require a Tour world');
      expect(() => standalone.startLocationDelivery(new Vector3(), 'bay')).toThrow(
        'Location APIs require a Tour world',
      );
      expect(() => standalone.getLocationReactionSnapshot('bay')).toThrow('Location APIs require a Tour world');
    }
  });
});
