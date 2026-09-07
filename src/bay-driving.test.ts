import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BayDrive, BAY_DRIVING_TUNING as T } from './bay-driving';
import type { BayDriveEvent, BayEnvironment, BaySurface, SurfacePose } from './bay-types';
import { advanceOnSphere, PLANET_RADIUS, spherical, surfaceDistance, tangent, type Collider } from './math';

const neutral = { throttle: 0, steer: 0, boost: false };
const throttle = { ...neutral, throttle: 1 };
const boosted = { ...throttle, boost: true };
const origin = spherical(30, 12);
const east = new Vector3(Math.cos(12 * Math.PI / 180), 0, -Math.sin(12 * Math.PI / 180));
const north = new Vector3().crossVectors(origin, east).normalize();
const LIP = -2.7;
const BASE = -4.9;
const PITCH = Math.atan(1.3 / 2.2);
const WATER_RADIUS = PLANET_RADIUS + 0.025;

// A single analytic strip and contact planes, deliberately independent of the
// real world's meshes, routes, checkpoint logic, and lip-crossing implementation.
class FakeBay implements BayEnvironment {
  spawnPose = this.pose(-6);
  recoveryPose = this.pose(-5.8, 0.1);
  colliders: Collider[] = [];
  crossings = 0;
  sampleCalls = 0;
  surfaceAt: (x: number, y: number, normal: Vector3) => BaySurface;

  constructor(readonly withRamp = false) {
    this.surfaceAt = (x, y, normal) => {
      if (!withRamp) return { kind: 'road', radius: T.baselineRadius };
      if (x >= BASE && x <= LIP && Math.abs(y) <= 0.9) {
        const t = (x - BASE) / (LIP - BASE);
        return { kind: 'ramp', radius: T.baselineRadius + 0.65 * t * t, rampProgress: t, rampSlope: 1.3 * t / 2.2, rampForward: tangent(east, normal) };
      }
      if (x > -2.3 && x < 2.3 && Math.abs(y) < 2) return { kind: 'water', radius: WATER_RADIUS };
      return { kind: 'ground', radius: PLANET_RADIUS + 0.075 };
    };
  }

  pose(x: number, y = 0, angle = 0): SurfacePose {
    const normal = origin.clone();
    const direction = east.clone().multiplyScalar(x).addScaledVector(north, y);
    if (direction.lengthSq() > 0) advanceOnSphere(normal, direction.normalize(), Math.hypot(x, y));
    return { normal, forward: tangent(east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(north, Math.sin(angle)), normal) };
  }

  xy(normal: Vector3): { x: number; y: number } {
    const cosine = Math.min(1, Math.max(-1, normal.dot(origin)));
    const direction = normal.clone().addScaledVector(origin, -cosine);
    const length = direction.length();
    if (length < 1e-12) return { x: 0, y: 0 };
    const scale = Math.atan2(length, cosine) * PLANET_RADIUS / length;
    return { x: direction.dot(east) * scale, y: direction.dot(north) * scale };
  }

  sampleSurface(normal: Vector3): BaySurface {
    this.sampleCalls++;
    const { x, y } = this.xy(normal);
    return this.surfaceAt(x, y, normal);
  }

  crossRampLip(previous: Vector3, next: Vector3) {
    if (!this.withRamp) return null;
    const p = this.xy(previous);
    const n = this.xy(next);
    if ((p.x < LIP) === (n.x < LIP) || p.x === n.x) return null;
    const fraction = (LIP - p.x) / (n.x - p.x);
    if (Math.abs(p.y + (n.y - p.y) * fraction) > 0.9) return null;
    const normal = previous.clone().lerp(next, fraction).normalize();
    this.crossings++;
    // Return both directions on purpose: the driver must reject reverse and
    // sideways crossings rather than trusting a permissive environment.
    return { normal, forward: tangent(east, normal), radius: T.baselineRadius + 0.65, pitch: PITCH, fraction };
  }
}

function place(drive: BayDrive, environment: FakeBay, x: number, speed: number, y = 0, angle = 0): void {
  const pose = environment.pose(x, y, angle);
  drive.normal.copy(pose.normal);
  drive.forward.copy(pose.forward);
  drive.contactRadius = environment.sampleSurface(drive.normal).radius;
  drive.altitude = drive.contactRadius - T.baselineRadius;
  drive.speed = speed;
}

function simulate(drive: BayDrive, seconds: number, controls = neutral, dt = T.step): BayDriveEvent[] {
  const events: BayDriveEvent[] = [];
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += dt) events.push(...drive.update(Math.min(dt, seconds - elapsed), controls));
  return events;
}

function until(drive: BayDrive, type: BayDriveEvent['type'], controls = neutral, horizon = 4, dt = T.step) {
  for (let elapsed = 0; elapsed < horizon; elapsed += dt) {
    const event = drive.update(dt, controls).find(item => item.type === type);
    if (event) return { event, time: elapsed + dt };
  }
  throw new Error(`No ${type} within ${horizon}s`);
}

function launched(speed: number, dt = 1 / 60) {
  const environment = new FakeBay(true);
  const drive = new BayDrive(environment);
  place(drive, environment, LIP - 0.035, speed);
  const events = drive.update(dt, neutral);
  expect(events.filter(event => event.type === 'launch')).toHaveLength(1);
  expect(drive.phase).toBe('airborne');
  return { drive, environment, events };
}

function airborne(environment = new FakeBay(), height = 2, radialSpeed = 0, speed = 0) {
  const drive = new BayDrive(environment);
  place(drive, environment, 0, speed);
  drive.phase = 'airborne';
  drive.contactRadius = T.baselineRadius + height;
  drive.altitude = height;
  drive.radialSpeed = radialSpeed;
  return drive;
}

function snapshot(drive: BayDrive) {
  return {
    normal: drive.normal.toArray(), forward: drive.forward.toArray(), speed: drive.speed, charge: drive.charge,
    contactRadius: drive.contactRadius, radialSpeed: drive.radialSpeed, altitude: drive.altitude,
    boosting: drive.boosting, phase: drive.phase, steer: drive.steer, acceleration: drive.acceleration,
    groundPitch: drive.groundPitch, impact: drive.impact, recoveries: drive.recoveries, jumps: drive.jumps, landings: drive.landings,
  };
}

function expectAligned(drive: BayDrive) {
  expect(drive.normal.length()).toBeCloseTo(1, 10);
  expect(drive.forward.length()).toBeCloseTo(1, 10);
  expect(drive.normal.dot(drive.forward)).toBeCloseTo(0, 10);
  expect([...drive.normal.toArray(), ...drive.forward.toArray(), drive.speed, drive.contactRadius, drive.radialSpeed].every(Number.isFinite)).toBe(true);
}

describe('BayDrive ground controls', () => {
  it('accelerates and boosts on flat ground without a Space hop', () => {
    const drive = new BayDrive(new FakeBay());
    simulate(drive, 2, throttle);
    expect(drive.speed).toBeGreaterThan(4.4);
    const events = simulate(drive, 1, boosted);
    expect(drive.speed).toBeGreaterThan(7.2);
    expect(drive.charge).toBeLessThan(0.7);
    expect(events.map(event => event.type)).toEqual(['boost']);
    expect(drive.phase).toBe('grounded');
    expect(drive.contactRadius).toBe(T.baselineRadius);
    expect(drive.altitude).toBe(0);
    expect(drive.radialSpeed).toBe(0);
    expect(drive.jumps).toBe(0);
    expect(drive.predictLanding()).toBeNull();
  });

  it('brakes at a distinct rate before engaging reverse', () => {
    const drive = new BayDrive(new FakeBay());
    drive.speed = T.cruiseSpeed;
    const reverse = { ...neutral, throttle: -1 };
    simulate(drive, 0.4, reverse);
    expect(drive.speed).toBeCloseTo(T.cruiseSpeed - T.braking * 0.4, 10);
    expect(drive.speed).toBeGreaterThan(0);
    simulate(drive, 0.1, reverse);
    expect(drive.speed).toBeLessThan(0);
    expect(drive.speed).toBeGreaterThan(-0.4);
    simulate(drive, 2, reverse);
    expect(drive.speed).toBeCloseTo(-T.reverseSpeed, 1);
    simulate(drive, 0.1, throttle);
    expect(drive.speed).toBeLessThan(0);
    simulate(drive, 1, throttle);
    expect(drive.speed).toBeGreaterThan(3);
  });

  it('coasts softly rather than applying the brakes on release', () => {
    const drive = new BayDrive(new FakeBay());
    drive.speed = T.cruiseSpeed;
    simulate(drive, 1);
    expect(drive.speed).toBeCloseTo(T.cruiseSpeed * Math.exp(-1), 9);
    expect(drive.acceleration).toBeLessThan(0);
    simulate(drive, 6);
    expect(drive.speed).toBe(0);
  });

  it('smooths actual steering and preserves the existing negative-angle convention', () => {
    const drive = new BayDrive(new FakeBay());
    drive.speed = 4;
    const normal = drive.normal.clone();
    const forward = drive.forward.clone();
    drive.update(T.step, { ...neutral, steer: 1 });
    expect(drive.steer).toBeGreaterThan(0);
    expect(drive.steer).toBeLessThan(0.1);
    advanceOnSphere(normal, forward, drive.speed * T.step);
    const right = new Vector3().crossVectors(drive.normal, tangent(forward, drive.normal));
    expect(drive.forward.dot(right)).toBeLessThan(0);
    simulate(drive, 0.2, { ...neutral, steer: 1 });
    const steer = drive.steer;
    drive.update(T.step, { ...neutral, steer: -1 });
    expect(drive.steer).toBeLessThan(steer);
    expect(drive.steer).toBeGreaterThan(0);
    expectAligned(drive);
  });

  it('latches depletion until release instead of repeatedly pulsing held boost', () => {
    const drive = new BayDrive(new FakeBay());
    drive.speed = 2;
    const events = simulate(drive, 10, boosted);
    expect(events.filter(event => event.type === 'boost')).toHaveLength(1);
    expect(drive.boosting).toBe(false);
    expect(drive.charge).toBeGreaterThan(0.9);
    expect(drive.speed).toBeCloseTo(T.cruiseSpeed, 3);
    drive.update(0.1, throttle);
    expect(drive.update(0.1, boosted).filter(event => event.type === 'boost')).toHaveLength(1);
    expect(drive.boosting).toBe(true);
  });

  it('does not announce boost until it can actually accelerate forward', () => {
    const drive = new BayDrive(new FakeBay());
    expect(simulate(drive, 0.5, { ...boosted, throttle: -1 })).toEqual([]);
    expect(drive.boosting).toBe(false);
    expect(drive.charge).toBe(1);
    expect(simulate(drive, 1, boosted).filter(event => event.type === 'boost')).toHaveLength(1);
  });
});

describe('BayDrive swept launch and support', () => {
  it.each([1 / 120, 1 / 60, 0.1])('does not miss a maximum-speed lip crossing at dt=%s', dt => {
    const { drive, environment, events } = launched(T.boostSpeed, dt);
    expect(environment.crossings).toBe(1);
    expect(drive.jumps).toBe(1);
    expect(environment.xy(events[0].normal).x).toBeCloseTo(LIP, 5);
    expect(environment.xy(drive.normal).x).toBeGreaterThan(LIP);
    expect(drive.radialSpeed).toBeGreaterThan(0);
    expect(drive.contactRadius).toBeGreaterThan(T.baselineRadius + 0.65);
    expect(drive.speed).toBeLessThan(T.boostSpeed * Math.cos(PITCH));
    expect(simulate(drive, 0.25).filter(event => event.type === 'launch')).toHaveLength(0);
  });

  it('splits launch velocity by ramp pitch and consumes the remaining flight time', () => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    const initialSpeed = 7;
    const dt = T.step;
    place(drive, environment, LIP - 0.02, initialSpeed);
    const speedAtLip = initialSpeed * Math.exp(-T.coastDrag * dt);
    drive.update(dt, neutral);
    const flightTime = dt - 0.02 / speedAtLip;
    expect(drive.speed).toBeCloseTo(speedAtLip * Math.cos(PITCH), 10);
    expect(drive.radialSpeed).toBeCloseTo(speedAtLip * Math.sin(PITCH) - T.gravity * flightTime, 6);
    expect(drive.contactRadius).toBeCloseTo(T.baselineRadius + 0.65 + speedAtLip * Math.sin(PITCH) * flightTime - 0.5 * T.gravity * flightTime ** 2, 6);
  });

  it('launches with boost already held instead of requiring a fresh key press', () => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    place(drive, environment, -7, 4);
    const events = simulate(drive, 0.9, boosted);
    expect(events.filter(event => event.type === 'boost')).toHaveLength(1);
    expect(events.filter(event => event.type === 'launch')).toHaveLength(1);
    expect(drive.phase).toBe('airborne');
    expect(drive.predictLanding()?.kind).not.toBe('water');
  });

  it.each([
    { name: 'reverse across the lip', x: LIP + 0.025, speed: -7, angle: 0 },
    { name: 'backwards-facing travel toward the bay', x: LIP - 0.025, speed: -7, angle: Math.PI },
    { name: 'mostly sideways', x: LIP - 0.025, speed: 7, angle: 75 * Math.PI / 180 },
  ])('rejects $name even with a permissive lip callback', ({ x, speed, angle }) => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    place(drive, environment, x, speed, -0.1, angle);
    const events = drive.update(0.05, neutral);
    expect(environment.crossings).toBeGreaterThan(0);
    expect(events.filter(event => event.type === 'launch')).toHaveLength(0);
    expect(drive.jumps).toBe(0);
  });

  it('falls from the lip below launch threshold instead of snapping to the road', () => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    place(drive, environment, LIP - 0.01, 2);
    const events = drive.update(1 / 30, neutral);
    expect(events.filter(event => event.type === 'launch')).toHaveLength(0);
    expect(drive.phase).toBe('airborne');
    expect(drive.contactRadius).toBeGreaterThan(T.baselineRadius + 0.64);
    expect(drive.radialSpeed).toBeLessThan(0);
    expect(drive.jumps).toBe(0);
  });

  it('follows raised/sloping support while grounded, including reverse pitch', () => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    place(drive, environment, -3.6, 0);
    drive.update(T.step, neutral);
    expect(drive.phase).toBe('grounded');
    expect(drive.contactRadius).toBe(environment.sampleSurface(drive.normal).radius);
    expect(drive.altitude).toBeGreaterThan(0.2);
    expect(drive.groundPitch).toBeGreaterThan(0.3);
    drive.forward.negate();
    drive.update(T.step, neutral);
    expect(drive.groundPitch).toBeLessThan(-0.3);
    expect(drive.predictLanding()).toBeNull();
  });

  it('falls from a large support drop with no ramp launch event', () => {
    const environment = new FakeBay();
    environment.surfaceAt = x => ({ kind: 'ground', radius: T.baselineRadius + (x < 0 ? 0.8 : 0) });
    const drive = new BayDrive(environment);
    place(drive, environment, -0.002, 1);
    expect(drive.update(1 / 60, neutral)).toEqual([]);
    expect(drive.phase).toBe('airborne');
    expect(drive.contactRadius).toBeGreaterThan(T.baselineRadius + 0.79);
    expect(drive.radialSpeed).toBeLessThan(0);
    expect(drive.predictLanding()?.kind).toBe('ground');
  });

  it('has a calculated boosted success interval, while cruise undershoots', () => {
    const outcomes: { speed: number; kind: BaySurface['kind']; x: number }[] = [];
    for (let speed = 3.2; speed <= T.boostSpeed + 1e-8; speed += 0.2) {
      const { drive, environment } = launched(speed);
      const prediction = drive.predictLanding();
      expect(prediction).not.toBeNull();
      outcomes.push({ speed, kind: prediction!.kind, x: environment.xy(prediction!.normal).x });
    }
    const safe = outcomes.filter(outcome => outcome.kind !== 'water' && outcome.x >= 2.55 && outcome.x <= 7.2);
    expect(safe.length).toBeGreaterThanOrEqual(6);
    expect(safe.at(-1)!.speed - safe[0].speed).toBeGreaterThan(1);
    expect(safe[0].speed).toBeGreaterThan(T.cruiseSpeed);
    expect(launched(T.cruiseSpeed).drive.predictLanding()?.kind).toBe('water');
    expect(outcomes.at(-1)!.kind).not.toBe('water');
    expect(outcomes.at(-1)!.x).toBeLessThan(7.2);
  });
});

describe('BayDrive ballistic flight and prediction', () => {
  it('integrates radial height analytically and ignores airborne throttle/boost', () => {
    const a = airborne(new FakeBay(), 2, 2, 6);
    const b = airborne(new FakeBay(), 2, 2, 6);
    a.update(0.1, boosted);
    b.update(0.1, { ...neutral, throttle: -1 });
    expect(a.speed).toBe(6);
    expect(a.contactRadius).toBeCloseTo(T.baselineRadius + 2 + 2 * 0.1 - 0.5 * T.gravity * 0.1 ** 2, 10);
    expect(a.radialSpeed).toBeCloseTo(2 - T.gravity * 0.1, 10);
    expect(a.normal.distanceTo(b.normal)).toBe(0);
    expect(a.contactRadius).toBe(b.contactRadius);
    expect(a.radialSpeed).toBe(b.radialSpeed);
    expect(a.boosting).toBe(false);
    expect(a.charge).toBe(1);
  });

  it.each([4.7, 6.1, 7.8])('predicts the same actual touchdown as live movement at speed %s', speed => {
    const { drive, environment } = launched(speed);
    const before = snapshot(drive);
    const prediction = drive.predictLanding()!;
    expect(prediction.time).toBeGreaterThan(0);
    expect(prediction.time).toBeLessThanOrEqual(4);
    expect(snapshot(drive)).toEqual(before);
    const touchdown = until(drive, prediction.kind === 'water' ? 'splash' : 'land');
    expect(touchdown.time).toBeGreaterThanOrEqual(prediction.time - 1e-7);
    expect(touchdown.time - prediction.time).toBeLessThanOrEqual(T.step + 1e-7);
    expect(surfaceDistance(touchdown.event.normal, prediction.normal)).toBeLessThan(1e-5);
    expect(environment.sampleSurface(touchdown.event.normal).radius).toBeCloseTo(prediction.radius, 8);
    expect(drive.contactRadius).toBeCloseTo(prediction.radius, 8);
  });

  it('predicts neutral future steering from a copy of the current smoothed input', () => {
    const { drive } = launched(7.8);
    simulate(drive, 0.2, { ...neutral, steer: 1 });
    const before = snapshot(drive);
    const prediction = drive.predictLanding()!;
    expect(snapshot(drive)).toEqual(before);
    const contact = until(drive, prediction.kind === 'water' ? 'splash' : 'land');
    expect(surfaceDistance(contact.event.normal, prediction.normal)).toBeLessThan(1e-5);
    expect(Math.abs(contact.time - prediction.time)).toBeLessThan(T.step + 1e-7);
    prediction.normal.negate();
    expect(drive.normal.distanceTo(prediction.normal)).toBeGreaterThan(1);
  });

  it('lands on descending raised support, records impact, and emits exactly once', () => {
    const environment = new FakeBay();
    const radius = T.baselineRadius + 1.2;
    environment.surfaceAt = () => ({ kind: 'road', radius });
    const drive = airborne(environment, 1.7, -2, 2);
    const prediction = drive.predictLanding()!;
    expect(prediction.radius).toBe(radius);
    const { event } = until(drive, 'land');
    expect(drive.phase).toBe('grounded');
    expect(drive.contactRadius).toBe(radius);
    expect(drive.radialSpeed).toBe(0);
    expect(drive.landings).toBe(1);
    expect(event.strength).toBeCloseTo(Math.sqrt(4 + 2 * T.gravity * 0.5) / T.boostSpeed, 6);
    expect(drive.impact).toBe(event.strength);
    const impact = drive.impact;
    expect(simulate(drive, 0.25).filter(item => item.type === 'land')).toHaveLength(0);
    expect(drive.impact).toBeCloseTo(impact * Math.exp(-T.impactDecay * 0.25), 8);
    expect(drive.altitude).toBeCloseTo(1.2, 10);
  });

  it('does not classify ascending contact with raised terrain as a landing', () => {
    const environment = new FakeBay();
    environment.surfaceAt = () => ({ kind: 'ground', radius: T.baselineRadius + 1 });
    const drive = airborne(environment, 0.95, 2, 0);
    const events = drive.update(0.01, neutral);
    expect(drive.phase).toBe('airborne');
    expect(drive.radialSpeed).toBeGreaterThan(0);
    expect(events).toEqual([]);
  });

  it('caps cumulative net aerial heading correction without lengthening the arc', () => {
    const drive = airborne(new FakeBay(), 50, 10, 6);
    let totalTurn = 0;
    const turnFor = (seconds: number, steer: number) => {
      for (let i = 0; i < seconds / T.step; i++) {
        const normal = drive.normal.clone();
        const forward = drive.forward.clone();
        drive.update(T.step, { ...boosted, steer });
        const beforeMovement = drive.forward.clone();
        advanceOnSphere(drive.normal.clone(), beforeMovement, -drive.speed * T.step);
        const angle = Math.atan2(normal.dot(new Vector3().crossVectors(forward, beforeMovement)), forward.dot(beforeMovement));
        totalTurn += angle;
        expect(Math.abs(angle)).toBeLessThanOrEqual(T.airSteerRate * T.step + 1e-9);
        expect(Math.abs(totalTurn)).toBeLessThanOrEqual(T.maxAirTurn + 1e-8);
      }
    };
    turnFor(2, 1);
    expect(totalTurn).toBeCloseTo(-T.maxAirTurn, 7);
    turnFor(2, -1);
    expect(totalTurn).toBeCloseTo(T.maxAirTurn, 7);
    expect(drive.speed).toBe(6);
    expect(drive.contactRadius).toBeCloseTo(T.baselineRadius + 50 + 10 * 4 - 0.5 * T.gravity * 4 ** 2, 7);
    expectAligned(drive);
  });

  it('has a finite prediction horizon and returns null for no touchdown', () => {
    const environment = new FakeBay();
    const drive = airborne(environment, 100, 20, 6);
    const calls = environment.sampleCalls;
    expect(drive.predictLanding()).toBeNull();
    expect(environment.sampleCalls - calls).toBeLessThanOrEqual(Math.ceil(4 / T.step) + 1);
  });
});

describe('BayDrive water, retry, collisions, and robustness', () => {
  it('only splashes at water contact, then restores the checkpoint within half a second', () => {
    const environment = new FakeBay(true);
    const drive = airborne(environment, 2, 0, 0);
    expect(drive.update(0.1, boosted)).toEqual([]);
    expect(drive.phase).toBe('airborne');
    expect(drive.recoveries).toBe(0);
    const predicted = drive.predictLanding()!;
    expect(predicted.kind).toBe('water');
    const { event } = until(drive, 'splash', boosted);
    const splashNormal = event.normal.clone();
    expect(drive.phase).toBe('recovering');
    expect(drive.contactRadius).toBe(WATER_RADIUS);
    expect(drive.predictLanding()).toBeNull();
    expect(drive.landings).toBe(0);
    expect(simulate(drive, 0.45)).toEqual([]);
    expect(drive.phase).toBe('recovering');
    const events = simulate(drive, 0.07);
    expect(events.map(item => item.type)).toEqual(['recovered']);
    expect(drive.phase).toBe('grounded');
    expect(drive.normal.distanceTo(environment.recoveryPose.normal)).toBeLessThan(1e-12);
    expect(drive.charge).toBe(1);
    expect(drive.speed).toBe(0);
    expect(drive.radialSpeed).toBe(0);
    expect(drive.recoveries).toBe(1);
    expect(event.normal.distanceTo(splashNormal)).toBe(0);
    expect(simulate(drive, 1).filter(item => item.type === 'splash' || item.type === 'recovered')).toHaveLength(0);
  });

  it('walks off a shoreline into a fall instead of an immediate terrain-triggered reset', () => {
    const environment = new FakeBay(true);
    const drive = new BayDrive(environment);
    place(drive, environment, -2.302, 2);
    const events = drive.update(T.step, neutral);
    expect(environment.sampleSurface(drive.normal).kind).toBe('water');
    expect(drive.phase).toBe('airborne');
    expect(drive.contactRadius).toBeGreaterThan(WATER_RADIUS);
    expect(events).toEqual([]);
  });

  it('manual retry refills, clears the launch latch and prediction, and queues one event', () => {
    const { drive, environment } = launched(7.8);
    drive.charge = 0;
    drive.recover();
    expect(drive.phase).toBe('grounded');
    expect(drive.charge).toBe(1);
    expect(drive.predictLanding()).toBeNull();
    expect(drive.recoveries).toBe(1);
    expect(drive.update(T.step, neutral).map(event => event.type)).toEqual(['recovered']);
    expect(drive.update(T.step, neutral)).toEqual([]);
    place(drive, environment, LIP - 0.025, 7.8);
    expect(drive.update(1 / 60, boosted).map(event => event.type)).toEqual(['boost', 'launch']);
    expect(drive.jumps).toBe(2);
  });

  it('manual retry cancels a pending water recovery without a second automatic event', () => {
    const drive = airborne(new FakeBay(true), 0.01, -2);
    until(drive, 'splash');
    drive.recover();
    expect(simulate(drive, 1).map(event => event.type)).toEqual(['recovered']);
    expect(drive.recoveries).toBe(1);
  });

  it('copies spawn/recovery vectors and completely clears counters and pending events on reset', () => {
    const { drive, environment } = launched(7.8);
    const spawn = environment.spawnPose.normal.clone();
    const recovery = environment.recoveryPose.normal.clone();
    const heading = environment.recoveryPose.forward.clone();
    until(drive, 'land');
    drive.recover();
    expect(drive.normal).not.toBe(environment.recoveryPose.normal);
    expect(drive.forward).not.toBe(environment.recoveryPose.forward);
    simulate(drive, 0.2, { ...boosted, steer: 1 });
    expect(environment.recoveryPose.normal.equals(recovery)).toBe(true);
    expect(environment.recoveryPose.forward.equals(heading)).toBe(true);
    drive.recover();
    drive.reset();
    expect(snapshot(drive)).toEqual(snapshot(new BayDrive(environment)));
    expect(drive.update(0, neutral)).toEqual([]);
    expect(environment.spawnPose.normal.equals(spawn)).toBe(true);
    expect(drive.normal).not.toBe(environment.spawnPose.normal);
  });

  it('separates grounded footprint collisions gently and bounds collision events', () => {
    const environment = new FakeBay();
    const obstacle = { normal: environment.pose(1).normal, radius: 0.35 };
    environment.colliders.push(obstacle);
    const drive = new BayDrive(environment);
    place(drive, environment, 0, 4.7);
    const { event } = until(drive, 'collision');
    expect(event.strength).toBeGreaterThan(0);
    expect(event.strength).toBeLessThanOrEqual(1);
    expect(drive.speed).toBeLessThanOrEqual(0);
    expect(drive.speed).toBeGreaterThanOrEqual(-0.7);
    expect(surfaceDistance(drive.normal, obstacle.normal)).toBeGreaterThanOrEqual(obstacle.radius + T.vehicleRadius - 1e-8);
    const events = simulate(drive, 1, throttle).filter(item => item.type === 'collision');
    expect(events.length).toBeLessThanOrEqual(Math.ceil(1 / T.collisionCooldown));
    expectAligned(drive);
  });

  it('does not apply footprint collider physics to flight', () => {
    const environment = new FakeBay();
    environment.colliders.push({ normal: environment.pose(0).normal, radius: 4 });
    const drive = airborne(environment, 0.05, 2, 4);
    expect(drive.update(0.1, neutral)).toEqual([]);
    expect(drive.speed).toBe(4);
    expect(drive.phase).toBe('airborne');
  });

  it('remains finite and tangent through the poles', () => {
    const environment = new FakeBay();
    environment.spawnPose = { normal: new Vector3(0, 1, 0), forward: new Vector3(0, 1, 0) };
    const drive = new BayDrive(environment);
    for (let i = 0; i < 1200; i++) {
      drive.update(1 / 60, { ...boosted, steer: Math.sin(i / 80) });
      expectAligned(drive);
    }
    drive.phase = 'airborne';
    drive.radialSpeed = 2;
    simulate(drive, 0.25, { ...neutral, steer: 1 });
    expectAligned(drive);
    const prediction = drive.predictLanding();
    expect(prediction).not.toBeNull();
    expect(prediction!.normal.length()).toBeCloseTo(1, 10);
    expect(Number.isFinite(prediction!.time)).toBe(true);
  });

  it('ignores invalid/nonpositive dt and sanitizes input without poisoning state', () => {
    const drive = new BayDrive(new FakeBay());
    const before = snapshot(drive);
    for (const dt of [0, -1, Number.NaN, Infinity, -Infinity]) {
      expect(drive.update(dt, boosted)).toEqual([]);
      expect(snapshot(drive)).toEqual(before);
    }
    drive.update(0.1, { throttle: Number.NaN, steer: Infinity, boost: true });
    expect(drive.speed).toBe(0);
    expect(drive.steer).toBe(0);
    expectAligned(drive);
  });

  it('clamps stalled frames and substeps them like ordinary fixed-rate updates', () => {
    const a = new BayDrive(new FakeBay());
    const b = new BayDrive(new FakeBay());
    const c = new BayDrive(new FakeBay());
    const controls = { ...boosted, steer: 0.4 };
    const aEvents = a.update(20, controls);
    const bEvents = b.update(T.maxDelta, controls);
    const cEvents = simulate(c, T.maxDelta, controls);
    expect(snapshot(a)).toEqual(snapshot(b));
    expect(aEvents).toEqual(bEvents);
    expect(c.normal.distanceTo(b.normal)).toBeLessThan(1e-12);
    expect(c.speed).toBeCloseTo(b.speed, 12);
    expect(c.steer).toBeCloseTo(b.steer, 12);
    expect(cEvents).toEqual(bEvents);
  });
});
