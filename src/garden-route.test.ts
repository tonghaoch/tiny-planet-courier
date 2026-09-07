import { beforeAll, describe, expect, it } from 'vitest';
import { BayDrive } from './bay-driving';
import { DeliveryRun } from './game';
import { PlanetWorld } from './world';
import { createBayPilot } from '../tests/helpers/bay-pilot';

let world: PlanetWorld;
beforeAll(() => { world = new PlanetWorld('garden'); });

function driveRoute(route: 'outer' | 'inner') {
  const level = world.gardenLevel!;
  const drive = new BayDrive(world.drivingEnvironment!);
  const run = new DeliveryRun(world.destinations, { keepDrivingOnFinish: true });
  const pilot = createBayPilot(route === 'outer' ? level.outerRoute : level.innerRoute, level.destination.normal, false);
  const visited: { x: number; y: number }[] = [];
  let collisions = 0;
  run.start();
  for (let i = 0; i < 120 * 35 && !run.finished; i++) {
    collisions += drive.update(1 / 120, pilot(drive)).filter(event => event.type === 'collision').length;
    run.update(1 / 120, drive.normal, drive.speed, 0, drive.phase === 'grounded');
    if (i % 30 === 0) visited.push(level.toLocal(drive.normal));
  }
  return { drive, run, collisions, visited, local: level.toLocal(drive.normal) };
}

describe('actual Garden routes using only driving inputs', () => {
  it.each(['outer', 'inner'] as const)('drives the %s route and delivers without collisions, jumps or recoveries', route => {
    const result = driveRoute(route);
    expect(result.run.finished, JSON.stringify(result.local)).toBe(true);
    expect(result.run.elapsed).toBeLessThan(25);
    expect(result.collisions).toBe(0);
    expect(result.drive.jumps).toBe(0); expect(result.drive.recoveries).toBe(0);
    expect(result.run.mode).toBe('playing');
    const elapsed = result.run.elapsed;
    expect(result.run.update(1, result.drive.normal, 0, 0)).toBeNull();
    expect(result.run.elapsed).toBe(elapsed);
    if (route === 'outer') expect(result.visited.some(p => p.y < -4)).toBe(true);
    else {
      expect(result.visited.some(p => p.x > -9 && p.y > 1)).toBe(true);
      expect(result.visited.some(p => p.x > -4.5 && p.y < -0.7)).toBe(true);
    }
  });

  it('rewards the shorter flower path in a real-controller smoke test', () => {
    expect(driveRoute('inner').run.elapsed).toBeLessThan(driveRoute('outer').run.elapsed);
  });

  it('uses visible flower beds rather than a hidden rule to block a straight-line bypass', () => {
    const drive = new BayDrive(world.drivingEnvironment!);
    let collided = false;
    for (let i = 0; i < 120 * 6 && !collided; i++) {
      collided = drive.update(1 / 120, { throttle: 1, steer: 0, boost: true }).some(event => event.type === 'collision');
    }
    expect(collided).toBe(true);
    expect(drive.phase).toBe('grounded');
    expect(world.root.getObjectByName('garden-flower-bed')).toBeDefined();
  });
});
