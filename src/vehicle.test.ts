import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { Vehicle, type Controls } from './vehicle';
import { PLANET_RADIUS, START_NORMAL, surfaceDistance } from './math';
import { PlanetWorld } from './world';

const coast: Controls = { throttle: 0, steer: 0, boost: false };
const drive = (vehicle: Vehicle, seconds: number, controls: Controls = coast) => {
  for (let i = 0; i < seconds * 120; i++) vehicle.update(1 / 120, controls, []);
};

describe('arcade sphere driving', () => {
  it('accelerates, brakes into reverse, and comes to rest after input is released', () => {
    const vehicle = new Vehicle(new Scene());
    drive(vehicle, 2, { throttle: 1, steer: 0, boost: false });
    expect(vehicle.speed).toBeGreaterThan(4);
    expect(surfaceDistance(vehicle.normal, START_NORMAL)).toBeGreaterThan(4);
    drive(vehicle, 2, { throttle: -1, steer: 0, boost: false });
    expect(vehicle.speed).toBeLessThan(-1);
    drive(vehicle, 4);
    expect(vehicle.speed).toBe(0);
  });

  it('spends boost energy, lands again and regenerates its charge', () => {
    const vehicle = new Vehicle(new Scene());
    drive(vehicle, 2, { throttle: 1, steer: 0, boost: false });
    drive(vehicle, 0.1, { throttle: 1, steer: 0, boost: true });
    expect(vehicle.altitude).toBeGreaterThan(0);
    expect(vehicle.charge).toBeLessThan(1);
    drive(vehicle, 0.7, { throttle: 1, steer: 0, boost: true });
    expect(vehicle.speed).toBeGreaterThan(5);
    expect(vehicle.altitude).toBe(0);
    drive(vehicle, 6);
    expect(vehicle.charge).toBe(1);
    expect(vehicle.altitude).toBe(0);
  });

  it('preserves surface alignment and fully resets repeated runs', () => {
    const vehicle = new Vehicle(new Scene());
    for (let i = 0; i < 3; i++) {
      drive(vehicle, 15, { throttle: 1, steer: 0.4, boost: false });
      vehicle.syncVisual(1 / 60, 15);
      expect(vehicle.normal.dot(vehicle.forward)).toBeCloseTo(0, 10);
      expect(vehicle.root.position.length()).toBeCloseTo(PLANET_RADIUS + 0.105, 10);
      vehicle.reset();
      expect(vehicle.speed).toBe(0);
      expect(vehicle.charge).toBe(1);
      expect(vehicle.normal.distanceTo(START_NORMAL)).toBe(0);
    }
  });

  it.each(['bay', 'station', 'garden'] as const)(
    'synchronizes the %s recovery pose immediately without reviving a delivered parcel',
    prototype => {
      const world = new PlanetWorld(prototype);
      const environment = world.drivingEnvironment!;
      const vehicle = new Vehicle(new Scene(), environment);
      drive(vehicle, 0.6, { throttle: 1, steer: 0, boost: true });
      expect(surfaceDistance(vehicle.normal, environment.recoveryPose.normal)).toBeGreaterThan(0.5);
      vehicle.setCargoVisible(false);
      vehicle.recover();
      expect(vehicle.drive!.recoveries).toBe(1);
      expect(vehicle.normal.distanceTo(environment.recoveryPose.normal)).toBeLessThan(1e-12);
      expect(vehicle.forward.distanceTo(environment.recoveryPose.forward)).toBeLessThan(1e-12);
      expect(vehicle.root.position.clone().normalize().distanceTo(environment.recoveryPose.normal)).toBeLessThan(1e-12);
      expect(vehicle.speed).toBe(0);
      expect(vehicle.charge).toBe(1);
      expect(vehicle.landingGuideVisible).toBe(false);
      expect(vehicle.cargoVisible).toBe(false);
    },
  );

  it('has a reachable start and unblocked delivery-pad centers', () => {
    const world = new PlanetWorld();
    for (const normal of [START_NORMAL, ...world.destinations.map(target => target.normal)]) {
      expect(world.heightAt(normal)).toBeCloseTo(PLANET_RADIUS + 0.105);
      for (const collider of world.colliders) {
        expect(surfaceDistance(normal, collider.normal)).toBeGreaterThan(collider.radius + 0.31);
      }
    }
  });
});
