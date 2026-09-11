import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BeaconLevel, DepotLevel } from './tour-outposts';
import { buildOutpostScene } from './world/outpost-scene';

function fixture(beacon: boolean, reducedMotion = false) {
  const level = beacon ? new BeaconLevel() : new DepotLevel();
  const root = new Group();
  root.rotation.y = 0.23;
  const { reaction } = buildOutpostScene(level, { root, colliders: [], reducedMotion });
  const id = level.destination.id;
  const recipient = root.getObjectByName(`${id}-recipient`)!;
  const arm = root.getObjectByName(`${id}-recipient-wave`)!;
  const parcel = root.getObjectByName(`${id}-handoff-parcel`)!;
  const lamp = (root.getObjectByName(`${id}-lamp`) as Mesh).material as MeshStandardMaterial;
  const origin = level.destination.normal.clone().multiplyScalar(15.6);
  return { root, reaction, recipient, arm, parcel, lamp, origin, id };
}

describe('outpost delivery reactions', () => {
  it.each([true, false])(
    'captures the rack origin, completes, and replays without allocating scene objects: beacon=%s',
    beacon => {
      const { root, reaction, recipient, arm, parcel, lamp, origin, id } = fixture(beacon);
      const initial = reaction.snapshot();
      const objects: string[] = [];
      root.traverse(object => objects.push(object.uuid));
      expect(initial).toEqual({
        destination: id,
        active: false,
        progress: 0,
        recipientVisible: true,
        parcelVisible: false,
        windowGlow: 0.18,
      });
      for (let visit = 0; visit < 4; visit++) {
        const supplied = origin.clone().add(new Vector3(visit * 0.1, 0.2, 0.1));
        const captured = supplied.clone();
        reaction.start(supplied);
        supplied.set(99, 99, 99);
        expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-10);
        expect(reaction.snapshot().progress).toBe(0);
        expect(lamp.emissiveIntensity).toBe(0.18);
        reaction.update(0.8);
        expect(arm.rotation.z).not.toBe(0);
        expect(reaction.snapshot().active).toBe(true);
        reaction.update(10);
        expect(reaction.snapshot()).toEqual({ ...initial, progress: 1, parcelVisible: true, windowGlow: 1.18 });
        expect(
          parcel.getWorldPosition(new Vector3()).distanceTo(recipient.localToWorld(new Vector3(0.09, 0.36, 0.12))),
        ).toBeLessThan(1e-10);
        const completed = parcel.position.clone();
        reaction.update(10);
        expect(parcel.position).toEqual(completed);
        const after: string[] = [];
        root.traverse(object => after.push(object.uuid));
        expect(after).toEqual(objects);
      }
      reaction.reset();
      expect(reaction.snapshot()).toEqual(initial);
      expect(arm.rotation.z).toBe(0);
    },
  );

  it('ignores invalid time and uses a smaller handoff arc and a steady reduced-motion wave', () => {
    const normal = fixture(true);
    const quiet = fixture(true, true);
    for (const scene of [normal, quiet]) {
      scene.reaction.start(scene.origin);
      const snapshot = scene.reaction.snapshot();
      for (const dt of [0, -1, NaN, Infinity]) scene.reaction.update(dt);
      expect(scene.reaction.snapshot()).toEqual(snapshot);
      scene.reaction.update(1);
    }
    expect(quiet.parcel.getWorldPosition(new Vector3()).length()).toBeLessThan(
      normal.parcel.getWorldPosition(new Vector3()).length(),
    );
    expect(quiet.arm.rotation.z).toBe(-0.3);
    quiet.reaction.update(0.2);
    expect(quiet.arm.rotation.z).toBe(-0.3);
    expect(quiet.parcel.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    quiet.reaction.update(10);
    normal.reaction.update(10);
    expect(quiet.reaction.snapshot()).toEqual(normal.reaction.snapshot());
  });
});
