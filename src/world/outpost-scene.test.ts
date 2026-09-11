import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AuthoredLevel } from '../authored-level';
import { BEACON_LEVEL, BeaconLevel, DEPOT_LEVEL, DepotLevel } from '../tour-outposts';
import { TourLayout } from '../tour-layout';
import { surfaceDistance, type Collider } from '../math';
import { PlanetWorld } from '../world';
import { localePrefix } from './locale-geometry';
import { buildOutpostScene } from './outpost-scene';
import { material } from './scenery-primitives';

function meshes(root: Group) {
  const result: Mesh[] = [];
  root.traverse(object => {
    if (object instanceof Mesh) result.push(object);
  });
  return result;
}

describe('compact outpost scenes', () => {
  it('names all five concrete locales explicitly and rejects unknown levels', () => {
    const layout = new TourLayout();
    expect(layout.stops.map(stop => localePrefix(stop.level))).toEqual(['bay', 'station', 'garden', 'beacon', 'depot']);
    expect(() => localePrefix(new AuthoredLevel(BEACON_LEVEL))).toThrow('Unknown authored locale');
  });

  it.each([
    { Level: BeaconLevel, data: BEACON_LEVEL, name: 'beacon-lighthouse' },
    { Level: DepotLevel, data: DEPOT_LEVEL, name: 'depot-tool-shed' },
  ])('keeps every $name decorative vertex inside its landmark and outside roads', ({ Level, data, name }) => {
    const level = new Level();
    const root = new Group();
    const colliders: Collider[] = [];
    const scene = buildOutpostScene(level, { root, colliders, reducedMotion: false });
    const id = data.destination.id;
    const site = root.getObjectByName(name) as Group;
    expect(site.parent).toBe(root);
    expect(colliders).toEqual([{ normal: level.toNormal(0, 2.1), radius: 0.65 }]);
    expect(scene.dynamicRoots).toEqual([scene.reaction.root]);
    const layout = new TourLayout();
    for (const elapsed of [0, 0.9, 10]) {
      if (elapsed) {
        scene.reaction.start(level.destination.normal.clone().multiplyScalar(15.6));
        scene.reaction.update(elapsed);
      }
      root.updateMatrixWorld(true);
      for (const object of meshes(site)) {
        // The moving delivery parcel intentionally travels from the real vehicle rack.
        if (object.parent?.name === `${id}-handoff-parcel`) continue;
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const normal = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).normalize();
          expect(level.isInFootprint(normal)).toBe(true);
          expect(surfaceDistance(normal, colliders[0].normal)).toBeLessThanOrEqual(data.landmark.colliderRadius);
          expect(level.sampleSurface(normal).kind).toBe('ground');
          expect(layout.isOnConnector(normal, 0.2)).toBe(false);
          expect(surfaceDistance(normal, level.destination.normal)).toBeGreaterThan(data.pad.radius + 0.34);
        }
      }
    }
    const bounds = new Vector3();
    site.updateWorldMatrix(true, true);
    const heights = meshes(site).flatMap(object => {
      const positions = object.geometry.getAttribute('position');
      return Array.from(
        { length: positions.count },
        (_, i) =>
          bounds.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).length() -
          level.definition.surfaceRadii.ground,
      );
    });
    expect(Math.max(...heights)).toBeGreaterThan(id === 'beacon' ? 2 : 0.9);
    expect(Math.max(...heights)).toBeLessThan(id === 'beacon' ? 2.3 : 1.1);
  });

  it('retains both complete animated subtrees and private glow materials through the single World batch', () => {
    const world = new PlanetWorld('tour');
    const pool = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.18 });
    const lamps: MeshStandardMaterial[] = [];
    for (const level of [world.beaconLevel!, world.depotLevel!]) {
      const root = new Group();
      const scene = buildOutpostScene(level, { root, colliders: [], reducedMotion: false });
      const id = localePrefix(level);
      const actual = world.root.getObjectByName(`${id}-animation`) as Group;
      expect(meshes(actual).map(mesh => [mesh.name, mesh.geometry.type])).toEqual(
        meshes(scene.reaction.root).map(mesh => [mesh.name, mesh.geometry.type]),
      );
      expect(meshes(actual).length).toBeGreaterThan(10);
      const lamp = (world.root.getObjectByName(`${id}-lamp`) as Mesh).material as MeshStandardMaterial;
      expect(lamp).not.toBe(pool);
      lamps.push(lamp);
      world.startLocationDelivery(level.destination.normal.clone().multiplyScalar(15.6), id);
    }
    expect(lamps[0]).not.toBe(lamps[1]);
    world.update(10, 10);
    expect(lamps.map(lamp => lamp.emissiveIntensity)).toEqual([1.18, 1.18]);
    expect(pool.emissiveIntensity).toBe(0.18);
  });
});
