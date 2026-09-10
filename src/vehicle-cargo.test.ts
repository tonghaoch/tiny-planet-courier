import { Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Vehicle } from './vehicle';
import { TourLayout } from './tour-layout';

const countObjects = (scene: Scene) => {
  let count = 0;
  scene.traverse(() => count++);
  return count;
};

describe('compatible rack cargo presentation', () => {
  it('retains the original single-parcel position and visibility API', () => {
    const vehicle = new Vehicle(new Scene());
    expect(vehicle.cargoCount).toBe(1);
    expect(vehicle.cargoVisible).toBe(true);
    const expected = vehicle.root.localToWorld(new Vector3(0, 0.97, -0.1));
    expect(vehicle.getParcelWorldPosition().distanceTo(expected)).toBeLessThan(1e-12);
    const origin = vehicle.consumeParcel();
    expect(origin).toEqual(expected);
    expect(vehicle.cargoVisible).toBe(false);
    expect(vehicle.consumeParcel()).toBeNull();
    expect(vehicle.getParcelWorldPosition()).toEqual(expected);
    vehicle.setCargoVisible(true);
    expect(vehicle.cargoCount).toBe(1);
    vehicle.setCargoVisible(false);
    vehicle.reset();
    expect(vehicle.cargoCount).toBe(1);
  });

  it('consumes three distinct actual world origins without changing driving state or other parcels', () => {
    const layout = new TourLayout();
    const vehicle = new Vehicle(new Scene(), layout.createEnvironment([]));
    vehicle.setCargoCapacity(3);
    for (let i = 0; i < 60; i++) vehicle.update(1 / 120, { throttle: 1, steer: 0.2, boost: true }, []);
    vehicle.syncVisual(1 / 60, 1);
    const positions = vehicle.getCargoWorldPositions();
    expect(positions).toHaveLength(3);
    expect(new Set(positions.map(p => p.toArray().join(','))).size).toBe(3);
    const state = {
      normal: vehicle.normal.clone(),
      forward: vehicle.forward.clone(),
      speed: vehicle.speed,
      charge: vehicle.charge,
    };
    for (let i = 0; i < 3; i++) {
      expect(vehicle.getParcelWorldPosition()).toEqual(positions[i]);
      expect(vehicle.consumeParcel()).toEqual(positions[i]);
      expect(vehicle.cargoCount).toBe(2 - i);
      expect(vehicle.cargoVisible).toBe(i < 2);
      expect(vehicle.getCargoWorldPositions()).toEqual(positions.slice(i + 1));
      expect({
        normal: vehicle.normal,
        forward: vehicle.forward,
        speed: vehicle.speed,
        charge: vehicle.charge,
      }).toEqual(state);
    }
    expect(vehicle.consumeParcel()).toBeNull();
  });

  it('preserves remaining parcels on recovery, restores three on reset, and never grows the scene', () => {
    const scene = new Scene();
    const layout = new TourLayout();
    const environment = layout.createEnvironment([]);
    const vehicle = new Vehicle(scene, environment, true);
    vehicle.setCargoCapacity(3);
    const size = countObjects(scene);
    for (let i = 0; i < 5; i++) {
      vehicle.consumeParcel();
      vehicle.consumeParcel();
      environment.recoveryPose = layout.stops[1].deliveredPose;
      vehicle.recover();
      expect(vehicle.cargoCount).toBe(1);
      expect(vehicle.normal).toEqual(environment.recoveryPose.normal);
      vehicle.reset();
      expect(vehicle.cargoCount).toBe(3);
      expect(vehicle.normal).toEqual(layout.spawnPose.normal);
      expect(countObjects(scene)).toBe(size);
    }
    vehicle.setCargoVisible(false);
    expect(vehicle.cargoCount).toBe(0);
    vehicle.setCargoVisible(true);
    expect(vehicle.cargoCount).toBe(3);
  });
});
