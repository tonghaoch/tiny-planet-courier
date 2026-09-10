import { beforeAll, describe, expect, it } from 'vitest';
import { BayDrive } from './bay-driving';
import { DeliveryRun } from './game';
import { PlanetWorld } from './world';
import { createBayPilot } from '../tests/helpers/bay-pilot';

let world: PlanetWorld;
beforeAll(() => {
  world = new PlanetWorld('station');
});

function driveRoute(route: 'outer' | 'inner') {
  const level = world.stationLevel!;
  const drive = new BayDrive(world.drivingEnvironment!);
  const run = new DeliveryRun(world.destinations, { keepDrivingOnFinish: true });
  const pilot = createBayPilot(
    route === 'outer' ? level.outerRoute : level.innerRoute,
    level.destination.normal,
    false,
  );
  let collisions = 0;
  const visited: { x: number; y: number }[] = [];
  run.start();
  for (let i = 0; i < 120 * 35 && !run.finished; i++) {
    const events = drive.update(1 / 120, pilot(drive));
    collisions += events.filter(event => event.type === 'collision').length;
    run.update(1 / 120, drive.normal, drive.speed, 0, drive.phase === 'grounded');
    if (i % 30 === 0) visited.push(level.toLocal(drive.normal));
  }
  return { drive, run, collisions, visited, local: level.toLocal(drive.normal) };
}

describe('actual Station routes using only driving inputs', () => {
  it.each(['outer', 'inner'] as const)('can drive the %s route and park without a collision or recovery', route => {
    const result = driveRoute(route);
    expect(result.run.finished, JSON.stringify(result.local)).toBe(true);
    expect(result.run.elapsed).toBeLessThan(25);
    expect(result.collisions).toBe(0);
    expect(result.drive.jumps).toBe(0);
    expect(result.drive.recoveries).toBe(0);
    expect(result.run.mode).toBe('playing');
    const elapsed = result.run.elapsed;
    expect(result.run.update(1, result.drive.normal, 0, 0)).toBeNull();
    expect(result.run.elapsed).toBe(elapsed);
    if (route === 'outer') expect(result.visited.some(p => p.y < -3.5)).toBe(true);
    else {
      expect(result.visited.some(p => p.y > 1)).toBe(true);
      expect(result.visited.some(p => p.x > -3.5 && p.y < -0.5)).toBe(true);
    }
  });

  it('offers a shorter driven delivery through the inner lane', () => {
    expect(driveRoute('inner').run.elapsed).toBeLessThan(driveRoute('outer').run.elapsed);
  });

  it('blocks the naive straight-line bypass with visible scenery, not a hidden rule', () => {
    const drive = new BayDrive(world.drivingEnvironment!);
    let collision = false;
    for (let i = 0; i < 120 * 5; i++) {
      collision ||= drive
        .update(1 / 120, { throttle: 1, steer: 0, boost: true })
        .some(event => event.type === 'collision');
      if (collision) break;
    }
    expect(collision).toBe(true);
    expect(world.root.getObjectByName('station-observatory')).toBeDefined();
    expect(drive.recoveries).toBe(0);
  });
});
