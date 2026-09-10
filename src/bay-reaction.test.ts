import { Group, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BAY_LEVEL } from './bay-level';
import { BayDeliveryReaction } from './bay-reaction';

function fixture(reducedMotion = false) {
  const root = new Group();
  const hinge = new Group();
  const recipient = new Group();
  const arm = new Group();
  const parcel = new Group();
  root.position.set(2, 4, 6);
  root.rotation.set(0.2, 0.3, -0.1);
  root.add(hinge, recipient, parcel);
  recipient.add(arm);
  const lamp = new MeshStandardMaterial({ emissiveIntensity: 0.2 });
  const reaction = new BayDeliveryReaction(root, hinge, recipient, arm, parcel, lamp, reducedMotion);
  return { root, hinge, recipient, arm, parcel, lamp, reaction };
}

describe('Bay delivery reaction', () => {
  it('retains its exact snapshot shape and hidden idle recipient', () => {
    const { reaction, recipient, parcel } = fixture();
    expect(reaction.snapshot()).toEqual({
      active: false,
      progress: 0,
      doorOpen: 0,
      recipientVisible: false,
      parcelVisible: false,
      windowGlow: 0.2,
    });
    expect(recipient.position.toArray()).toEqual([0, 0.06, 0.1]);
    expect(parcel.position.toArray()).toEqual([0, 0, 0]);
    reaction.update(1);
    expect(reaction.snapshot().progress).toBe(0);
    const snapshot = reaction.snapshot();
    snapshot.windowGlow = 99;
    expect(reaction.snapshot().windowGlow).toBe(0.2);
  });

  it('ignores invalid deltas, captures the world origin and retains a completed handoff', () => {
    const { reaction, parcel, recipient } = fixture();
    const start = new Vector3(5, 6, 7);
    const captured = start.clone();
    reaction.start(start);
    start.set(99, 99, 99);
    expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-12);
    const initial = reaction.snapshot();
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) {
      reaction.update(dt);
      expect(reaction.snapshot()).toEqual(initial);
      expect(parcel.getWorldPosition(new Vector3()).distanceTo(captured)).toBeLessThan(1e-12);
    }
    reaction.update(0.19);
    expect(reaction.snapshot().recipientVisible).toBe(false);
    reaction.update(0.02);
    expect(reaction.snapshot().recipientVisible).toBe(true);
    reaction.update(BAY_LEVEL.reactionDuration);
    expect(reaction.snapshot()).toEqual({
      active: false,
      progress: 1,
      doorOpen: 1,
      recipientVisible: true,
      parcelVisible: true,
      windowGlow: 1.2,
    });
    expect(
      parcel.getWorldPosition(new Vector3()).distanceTo(recipient.localToWorld(new Vector3(0.08, 0.46, 0.28))),
    ).toBeLessThan(1e-12);
    const finishedPosition = parcel.position.clone();
    reaction.update(10);
    expect(parcel.position).toEqual(finishedPosition);
  });

  it.each([false, true])('resets every animated transform on replay (reduced motion: %s)', reducedMotion => {
    const { reaction, hinge, recipient, arm, parcel, lamp } = fixture(reducedMotion);
    const start = new Vector3(5, 6, 7);
    reaction.start(start);
    reaction.update(1);
    if (reducedMotion) {
      expect(arm.rotation.z).toBe(-0.3);
      expect(parcel.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
    } else {
      expect(parcel.rotation.y).not.toBe(0);
    }
    recipient.scale.setScalar(2);
    recipient.rotation.y = 1;
    parcel.scale.setScalar(2);
    reaction.start(start);
    expect(reaction.snapshot().progress).toBe(0);
    expect(hinge.rotation.y).toBe(0);
    expect(arm.rotation.z).toBe(0);
    expect(recipient.position.toArray()).toEqual([0, 0.06, 0.1]);
    expect(recipient.rotation.y).toBe(0);
    expect(recipient.scale.toArray()).toEqual([1, 1, 1]);
    expect(recipient.visible).toBe(false);
    expect(parcel.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
    expect(parcel.scale.toArray()).toEqual([1, 1, 1]);
    expect(parcel.visible).toBe(true);
    expect(lamp.emissiveIntensity).toBe(0.2);
    reaction.reset();
    expect(parcel.visible).toBe(false);
    expect(parcel.position.toArray()).toEqual([0, 0, 0]);
  });
});
