import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBayPilot } from '../../tests/helpers/bay-pilot';
import { BayDrive } from '../bay-driving';
import { DeliveryRun } from '../game';
import { headingTo, surfaceDistance } from '../math';
import { createTourPlan, TOUR_LOCATION_IDS } from '../tour-itinerary';
import { TourSession } from '../tour-session';
import { PlanetWorld } from '../world';

function tourPilot(drive: BayDrive, route: Vector3[], destination: Vector3, shortcut = false) {
  const pilot = createBayPilot(route, destination, shortcut);
  const exit = route[Math.min(10, route.length - 1)];
  let turning = Math.abs(headingTo(drive.normal, drive.forward, exit)) > Math.PI / 2;
  return () => {
    if (turning) {
      const angle = headingTo(drive.normal, drive.forward, exit);
      if (Math.abs(angle) > 0.65) return { throttle: -1, steer: -Math.sign(angle), boost: false };
      turning = false;
    }
    return pilot(drive);
  };
}

describe('real constructed World controller traversal', () => {
  let world: PlanetWorld;
  beforeAll(() => {
    world = new PlanetWorld('tour');
  });

  it.each(
    TOUR_LOCATION_IDS.flatMap(from => TOUR_LOCATION_IDS.filter(to => from !== to).map(to => [from, to] as const)),
  )('drives %s -> %s with all actual scenery colliders', (from, to) => {
    const layout = world.tourLayout!;
    const environment = world.drivingEnvironment!;
    // Independent departure-pad setup only; no pose writes or recovery along the route.
    environment.spawnPose = layout.location(from).deliveredPose;
    const drive = new BayDrive(environment);
    const destination = layout.location(to).destination;
    const run = new DeliveryRun([destination]);
    run.start();
    const pilot = tourPilot(drive, layout.routeBetween(from, to, 'wide'), destination.normal);
    let collisions = 0;
    for (let tick = 0; tick < 120 * 180 && !run.finished; tick++) {
      collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
      run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(run.finished, `${from}->${to}: ${JSON.stringify(layout.location(to).level.toLocal(drive.normal))}`).toBe(
      true,
    );
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
    expect(drive.jumps).toBe(0);
  });

  it.each(TOUR_LOCATION_IDS)('drives from the true Bay spawn to %s with actual colliders', to => {
    const layout = world.tourLayout!;
    const environment = world.drivingEnvironment!;
    environment.spawnPose = layout.spawnPose;
    const drive = new BayDrive(environment);
    const destination = layout.location(to).destination;
    const run = new DeliveryRun([destination]);
    run.start();
    const pilot = tourPilot(drive, layout.routeBetween('spawn', to, 'wide'), destination.normal);
    let collisions = 0;
    for (let tick = 0; tick < 120 * 180 && !run.finished; tick++) {
      collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
      run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
    }
    expect(run.finished).toBe(true);
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
  });

  it.each(['beacon', 'depot'] as const)('drives both %s local alternatives with actual colliders', id => {
    const level = id === 'beacon' ? world.beaconLevel! : world.depotLevel!;
    for (const route of [level.outerRoute, level.innerRoute]) {
      const environment = world.drivingEnvironment!;
      environment.spawnPose = level.spawnPose;
      const drive = new BayDrive(environment);
      const run = new DeliveryRun([level.destination]);
      run.start();
      const pilot = tourPilot(drive, route, level.destination.normal);
      let collisions = 0;
      for (let tick = 0; tick < 120 * 30 && !run.finished; tick++) {
        collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
        run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
      }
      expect(run.finished).toBe(true);
      expect(collisions).toBe(0);
      expect(drive.recoveries).toBe(0);
      expect(drive.jumps).toBe(0);
    }
  });

  it.each([0, 1])('drives ten continuous deliveries for seed %s through the actual World', seed => {
    const layout = world.tourLayout!;
    const environment = world.drivingEnvironment!;
    environment.spawnPose = layout.spawnPose;
    const drive = new BayDrive(environment);
    const session = new TourSession(layout, createTourPlan(seed));
    session.start();
    world.resetDelivery();
    let collisions = 0;
    for (let leg = 0; leg < 10; leg++) {
      const pilot = tourPilot(drive, session.routeForLeg(leg, 'wide'), session.target!.normal);
      for (let tick = 0; tick < 120 * 180 && session.index === leg; tick++) {
        collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
        session.updateLocation(drive.normal, drive.phase === 'grounded');
        const before = { normal: drive.normal.clone(), forward: drive.forward.clone(), speed: drive.speed };
        const event = session.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
        if (event) {
          world.startLocationDelivery(drive.normal.clone().multiplyScalar(15.6), event.locationId);
          world.setActiveLocation(event.finished ? null : session.currentLocationId!);
          expect(drive.normal).toEqual(before.normal);
          expect(drive.forward).toEqual(before.forward);
          expect(drive.speed).toBe(before.speed);
        }
        world.update(1 / 120, tick / 120);
        world.setTourRecoveryPose(session.checkpoint.pose);
      }
      expect(session.index, `seed ${seed}, leg ${leg}`).toBe(leg + 1);
      expect(session.finished).toBe(leg === 9);
      expect(collisions).toBe(0);
      expect(drive.recoveries).toBe(0);
    }
    expect(session.splits).toHaveLength(10);
  });

  it.each(['wide', 'short'] as const)('preserves old-three %s alternatives and the closing road', variant => {
    const layout = world.tourLayout!;
    const environment = world.drivingEnvironment!;
    environment.spawnPose = layout.spawnPose;
    const drive = new BayDrive(environment);
    const run = new DeliveryRun(layout.destinations.slice(0, 3), { keepDrivingOnFinish: true });
    run.start();
    let collisions = 0;
    for (let leg = 0; leg < 3; leg++) {
      const pilot = tourPilot(
        drive,
        layout.routeForLeg(leg, variant),
        layout.stops[leg].destination.normal,
        leg === 0 && variant === 'short',
      );
      for (let tick = 0; tick < 120 * 80 && run.index === leg; tick++) {
        collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
        run.update(1 / 120, drive.normal, drive.speed, drive.altitude, drive.phase === 'grounded');
      }
      expect(run.index).toBe(leg + 1);
      expect(drive.recoveries).toBe(0);
      expect(collisions).toBe(0);
    }
    expect(run.finished).toBe(true);
    expect(drive.jumps).toBe(variant === 'short' ? 1 : 0);
    const pilot = tourPilot(drive, layout.connectors[2].path, layout.spawnPose.normal);
    let parkedFor = 0;
    for (let tick = 0; tick < 120 * 60 && parkedFor < 0.6; tick++) {
      collisions += drive.update(1 / 120, pilot()).filter(event => event.type === 'collision').length;
      parkedFor =
        surfaceDistance(drive.normal, layout.spawnPose.normal) < 1.08 && Math.abs(drive.speed) < 1.15
          ? parkedFor + 1 / 120
          : 0;
    }
    expect(parkedFor).toBeGreaterThanOrEqual(0.6);
    expect(collisions).toBe(0);
    expect(drive.recoveries).toBe(0);
  });
});
