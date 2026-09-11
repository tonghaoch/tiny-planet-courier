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
  it('allocates ten parcels lazily, fits one shallow roof rack after updates, and reuses it', () => {
    const scene = new Scene();
    const layout = new TourLayout();
    const vehicle = new Vehicle(scene, layout.createEnvironment([]), true);
    const soloSize = countObjects(scene);
    vehicle.setCargoCapacity(10);
    const rackSize = countObjects(scene);
    expect(rackSize - soloSize).toBe(9 * 4);
    for (let cycle = 0; cycle < 8; cycle++) {
      vehicle.reset();
      vehicle.update(1 / 120, { throttle: 0, steer: 0, boost: false }, []);
      vehicle.syncVisual(1 / 60, cycle);
      const positions = vehicle.getCargoWorldPositions();
      expect(positions).toHaveLength(10);
      positions.forEach((point, index) => {
        const local = vehicle.root.worldToLocal(point.clone());
        expect(local.x).toBeCloseTo(index % 2 ? 0.13 : -0.13, 10);
        expect(local.y).toBeCloseTo(0.94, 10);
        expect(local.z).toBeCloseTo(-0.27 + Math.floor(index / 2) * 0.155, 10);
        // Parcel half-extents (including tape) stay within the unchanged roof.
        expect(Math.abs(local.x) + 0.072).toBeLessThan(0.34);
        expect(local.z - 0.072).toBeGreaterThan(-0.38);
        expect(local.z + 0.074).toBeLessThan(0.46);
        expect(local.y - 0.05).toBeGreaterThan(0.88);
      });
      for (let index = 0; index < 10; index++) {
        const pose = [vehicle.normal.clone(), vehicle.forward.clone(), vehicle.speed, vehicle.charge];
        expect(vehicle.consumeParcel()).toEqual(positions[index]);
        expect(vehicle.cargoCount).toBe(9 - index);
        expect([vehicle.normal, vehicle.forward, vehicle.speed, vehicle.charge]).toEqual(pose);
      }
      expect(vehicle.consumeParcel()).toBeNull();
      vehicle.recover();
      expect(vehicle.cargoCount).toBe(0);
      vehicle.setCargoCapacity(3);
      vehicle.reset();
      expect(vehicle.getCargoWorldPositions().map(point => vehicle.root.worldToLocal(point))).toEqual(
        [new Vector3(-0.17, 0.97, -0.21), new Vector3(0.17, 0.97, -0.21), new Vector3(0, 0.97, 0.12)].map(point => {
          // Compare after the same spherical world transform's floating-point roundtrip.
          return vehicle.root.worldToLocal(vehicle.root.localToWorld(point));
        }),
      );
      vehicle.setCargoCapacity(1);
      vehicle.reset();
      expect(vehicle.getParcelWorldPosition()).toEqual(vehicle.root.localToWorld(new Vector3(0, 0.97, -0.1)));
      vehicle.setCargoCapacity(10);
      vehicle.consumeParcel();
      vehicle.recover();
      expect(vehicle.cargoCount).toBe(9);
      expect(countObjects(scene)).toBe(rackSize);
    }
  });
  it.each([false, true])(
    'hands off ten moving rack origins without changing pose or charge (reduced motion: %s)',
    reducedMotion => {
      const layout = new TourLayout();
      const vehicle = new Vehicle(new Scene(), layout.createEnvironment([]), reducedMotion);
      vehicle.setCargoCapacity(10);
      for (let step = 0; step < 60; step++) vehicle.update(1 / 120, { throttle: 1, steer: 0.2, boost: true }, []);
      vehicle.syncVisual(1 / 60, 1);
      const positions = vehicle.getCargoWorldPositions();
      expect(new Set(positions.map(position => position.toArray().join(','))).size).toBe(10);
      const state = [vehicle.normal.clone(), vehicle.forward.clone(), vehicle.speed, vehicle.charge];
      for (let index = 0; index < 10; index++) {
        expect(vehicle.consumeParcel()).toEqual(positions[index]);
        expect(vehicle.getCargoWorldPositions()).toEqual(positions.slice(index + 1));
        expect([vehicle.normal, vehicle.forward, vehicle.speed, vehicle.charge]).toEqual(state);
      }
      expect(vehicle.consumeParcel()).toBeNull();
    },
  );

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
