import { describe, expect, it } from 'vitest';
import { BeaconLevel, DepotLevel, BEACON_LEVEL, DEPOT_LEVEL } from './tour-outposts';
import { BayDrive } from './bay-driving';
import { DeliveryRun } from './game';
import { createBayPilot } from '../tests/helpers/bay-pilot';
import { PLANET_RADIUS, surfaceDistance } from './math';

describe('compact dry southern outposts', () => {
  it.each([BeaconLevel, DepotLevel])('owns two supported alternatives without ramp or water', Level => {
    const level = new Level();
    expect(level.definition.radius).toBe(PLANET_RADIUS);
    expect(level.definition.waterPolygon).toEqual([]);
    expect(level.definition.ramp).toBeUndefined();
    expect(level.outerRoute).not.toEqual(level.innerRoute);
    for (const route of [level.outerRoute, level.innerRoute]) {
      expect(route[0]).toEqual(level.spawnPose.normal);
      expect(route.at(-1)).toEqual(level.destination.normal);
      for (let i = 0; i < route.length; i++) {
        expect(level.isInFootprint(route[i])).toBe(true);
        expect(level.sampleSurface(route[i]).kind).toBe('road');
        if (i) expect(surfaceDistance(route[i - 1], route[i])).toBeLessThanOrEqual(0.220001);
      }
    }
    const anchor = { latitude: -60, longitude: 10 };
    const placed = new Level(anchor);
    anchor.latitude = 0;
    expect(placed.definition.anchor.latitude).toBe(-60);
  });

  it.each([
    { name: 'Beacon', Level: BeaconLevel, definition: BEACON_LEVEL, variant: 'wide' },
    { name: 'Beacon', Level: BeaconLevel, definition: BEACON_LEVEL, variant: 'short' },
    { name: 'Depot', Level: DepotLevel, definition: DEPOT_LEVEL, variant: 'wide' },
    { name: 'Depot', Level: DepotLevel, definition: DEPOT_LEVEL, variant: 'short' },
  ] as const)('drives $name $variant with real inputs and landmark clearance', ({ Level, definition, variant }) => {
    const level = new Level();
    const drive = new BayDrive({
      spawnPose: level.spawnPose,
      recoveryPose: level.recoveryPose,
      colliders: [
        {
          normal: level.toNormal(definition.landmark.center.x, definition.landmark.center.y),
          radius: definition.landmark.colliderRadius,
        },
      ],
      sampleSurface: normal => level.sampleSurface(normal),
      crossRampLip: (a, b) => level.crossRampLip(a, b),
    });
    const run = new DeliveryRun([level.destination]);
    run.start();
    const pilot = createBayPilot(
      variant === 'wide' ? level.outerRoute : level.innerRoute,
      level.destination.normal,
      false,
    );
    let collisions = 0;
    for (let tick = 0; tick < 120 * 30 && !run.finished; tick++) {
      collisions += drive.update(1 / 120, pilot(drive)).filter(event => event.type === 'collision').length;
      run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(run.finished).toBe(true);
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
    expect(drive.jumps).toBe(0);
  });
});
