import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { PLANET_RADIUS as R } from '../math';
import { PlanetWorld } from '../world';

function splashParticles(world: PlanetWorld) {
  const particles: Object3D[] = [];
  world.root.traverse(object => {
    if (object.name === 'bay-splash-particle') particles.push(object);
  });
  return particles;
}

describe('Bay world reaction wrappers', () => {
  it.each(['bay', 'tour'] as const)('clears live splashes on direct and indexed start/reset in %s', mode => {
    const world = new PlanetWorld(mode);
    const normal = world.bayLevel!.toNormal(0, 0);
    const parcelStart = world.destinations[0].normal.clone().multiplyScalar(R + 0.6);
    for (const action of [
      () => world.startBayDelivery(parcelStart),
      () => world.resetBayDelivery(),
      () => world.startDelivery(parcelStart, 0),
      () => world.resetDelivery(),
    ]) {
      world.splash(normal);
      const particles = splashParticles(world);
      expect(particles).toHaveLength(20);
      expect(particles.every(particle => particle.visible)).toBe(true);
      const positions = particles.map(particle => particle.position.clone());
      action();
      expect(particles.every(particle => !particle.visible)).toBe(true);
      world.update(0.01, 1, true);
      expect(particles.every(particle => !particle.visible)).toBe(true);
      // Clearing visibility alone is insufficient: zero life also stops pool updates.
      particles.forEach((particle, index) => expect(particle.position).toEqual(positions[index]));
      expect(splashParticles(world)).toEqual(particles);
    }
  });

  it('does not clear Bay splashes for another recipient or an invalid delivery index', () => {
    const world = new PlanetWorld('tour');
    world.splash(world.bayLevel!.toNormal(0, 0));
    const particles = splashParticles(world);
    for (const index of [1, 2, -1, 3, NaN]) {
      world.startDelivery(world.destinations[0].normal.clone().multiplyScalar(R + 0.6), index);
      expect(particles.every(particle => particle.visible)).toBe(true);
    }
    world.resetBayDelivery();
    expect(particles.every(particle => !particle.visible)).toBe(true);
    expect(world.getDeliveryReactionSnapshot(1).active).toBe(true);
    expect(world.getDeliveryReactionSnapshot(2).active).toBe(true);
  });
});
