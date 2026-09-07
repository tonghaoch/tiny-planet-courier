import { beforeAll, describe, expect, it } from 'vitest';
import { BayDrive } from './bay-driving';
import { BAY_LEVEL } from './bay-level';
import { DeliveryRun } from './game';
import { tangent } from './math';
import { PlanetWorld } from './world';
import { createBayPilot } from '../tests/helpers/bay-pilot';

let world: PlanetWorld;
beforeAll(() => { world = new PlanetWorld(true); });

function driveRoute(shortcut: boolean) {
  const drive = new BayDrive(world.bayEnvironment!);
  const run = new DeliveryRun(world.destinations, { keepDrivingOnFinish: true });
  const level = world.bayLevel!;
  const pilot = createBayPilot(shortcut ? level.jumpRoute : level.safeRoute, level.destination.normal, shortcut);
  run.start();
  for (let i = 0; i < 120 * 45 && !run.finished; i++) {
    drive.update(1 / 120, pilot(drive));
    run.update(1 / 120, drive.normal, drive.speed, 0, drive.phase === 'grounded');
  }
  return { drive, run, local: level.toLocal(drive.normal) };
}

describe('actual bay routes using only driving inputs', () => {
  it('can drive the entire safe road and deliver without jumping or falling', () => {
    const result = driveRoute(false);
    expect(result.run.finished, JSON.stringify(result.local)).toBe(true);
    expect(result.drive.jumps).toBe(0);
    expect(result.drive.recoveries).toBe(0);
    expect(result.run.elapsed).toBeLessThan(30);
  });

  it('can accelerate from spawn, leap over the bay, brake, and deliver', () => {
    const result = driveRoute(true);
    expect(result.run.finished, JSON.stringify(result.local)).toBe(true);
    expect(result.drive.jumps).toBe(1);
    expect(result.drive.landings).toBe(1);
    expect(result.drive.recoveries).toBe(0);
    expect(result.run.mode).toBe('playing');
    expect(result.run.elapsed).toBeLessThan(driveRoute(false).run.elapsed);
  });

  it('an unboosted approach undershoots and returns to the dry approach', () => {
    const drive = new BayDrive(world.bayEnvironment!);
    let splashed = false;
    for (let i = 0; i < 120 * 8 && drive.recoveries === 0; i++) {
      const events = drive.update(1 / 120, { throttle: 1, steer: 0, boost: false });
      splashed ||= events.some(event => event.type === 'splash');
    }
    expect(splashed).toBe(true);
    expect(drive.recoveries).toBe(1);
    expect(drive.normal.distanceTo(world.bayEnvironment!.recoveryPose.normal)).toBeLessThan(1e-8);
    expect(drive.phase).toBe('grounded');
    expect(drive.charge).toBe(1);
  });

  it('allows a deliberate brake-and-park handoff before reverse acceleration pulls the van away', () => {
    const level = world.bayLevel!;
    const normal = level.toNormal(BAY_LEVEL.pad.center.x - 1, 0);
    const forward = tangent(level.destination.normal, normal);
    const drive = new BayDrive({ ...world.bayEnvironment!, spawnPose: { normal, forward } });
    const run = new DeliveryRun(world.destinations, { keepDrivingOnFinish: true });
    drive.speed = 3;
    run.start();
    for (let i = 0; i < 120 * 2 && !run.finished; i++) {
      drive.update(1 / 120, { throttle: -1, steer: 0, boost: false });
      run.update(1 / 120, drive.normal, drive.speed, 0, drive.phase === 'grounded');
    }
    expect(run.finished).toBe(true);
  });

  it.each([6.2, 6.8, 7.8])('provides a broad landing window at entry speed %s', speed => {
    const level = world.bayLevel!;
    const normal = level.toNormal(BAY_LEVEL.ramp.lip.x - 0.025, 0);
    const forward = tangent(level.toNormal(BAY_LEVEL.ramp.lip.x + 0.1, 0), normal);
    const environment = { ...world.bayEnvironment!, spawnPose: { normal, forward } };
    const drive = new BayDrive(environment);
    drive.speed = speed;
    let contact: string | undefined;
    for (let i = 0; i < 120 * 3 && !contact; i++) {
      const events = drive.update(1 / 120, { throttle: 1, steer: 0, boost: true });
      contact = events.find(event => event.type === 'land' || event.type === 'splash')?.type;
    }
    expect(contact).toBe('land');
    const landed = level.toLocal(drive.normal);
    expect(landed.x).toBeGreaterThan(2.3);
    expect(landed.x).toBeLessThan(BAY_LEVEL.pad.center.x);
    expect(Math.abs(landed.y)).toBeLessThan(1.65);
  });
});
