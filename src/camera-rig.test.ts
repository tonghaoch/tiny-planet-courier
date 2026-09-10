import { describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CameraRig, type CameraFrame } from './camera-rig';
import type { PrototypeId } from './delivery-prototypes';
import { PLANET_RADIUS, spherical, UP } from './math';

const prototypeIds: (PrototypeId | null)[] = [null, 'bay', 'station', 'garden', 'tour'];

function frame(overrides: Partial<CameraFrame> = {}): CameraFrame {
  return {
    dt: 0,
    elapsed: 0,
    mode: 'playing',
    finished: false,
    vehicle: {
      normal: new Vector3(0, 0, 1),
      forward: new Vector3(0, 1, 0),
      altitude: 0,
      boosting: false,
      phase: 'grounded',
    },
    viewport: { width: 1200, height: 800 },
    welcomeFrame: { x: 816, y: 492, diameter: 544 },
    ...overrides,
  };
}

function setup(prototypeId: PrototypeId | null = 'bay', reducedMotion = false) {
  const camera = new PerspectiveCamera(38, 1.5, 0.1, 300);
  return { camera, rig: new CameraRig(camera, prototypeId, reducedMotion) };
}

function expectVector(actual: Vector3, expected: Vector3) {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-10);
}

function expectLook(camera: PerspectiveCamera, target: Vector3) {
  expectVector(camera.getWorldDirection(new Vector3()), target.clone().sub(camera.position).normalize());
}

describe('CameraRig frame inputs', () => {
  it.each(prototypeIds)('preserves the %s welcome orbit and cached framing', prototypeId => {
    const { camera, rig } = setup(prototypeId);
    const current = frame({ mode: 'home', elapsed: 12, welcomeFrame: { x: 730, y: 440, diameter: 500 } });
    rig.update(current);
    const latitude = prototypeId === 'garden' ? 42 : prototypeId === 'station' ? -4 : 23;
    const longitude =
      prototypeId === 'tour'
        ? 0
        : prototypeId === 'garden'
          ? -78
          : prototypeId === 'station'
            ? 70
            : prototypeId === 'bay'
              ? 25
              : 34;
    const distance = PLANET_RADIUS / Math.sin(Math.atan((500 / 800) * Math.tan(MathUtils.degToRad(19))));
    expectVector(
      camera.position,
      spherical(latitude + Math.sin(12 * 0.05) * 1.5, longitude + Math.sin(12 * 0.032) * 13).multiplyScalar(distance),
    );
    expectVector(camera.up, UP);
    expectLook(camera, new Vector3());
    expect(camera.fov).toBe(38);
    expect(camera.view).toMatchObject({ fullWidth: 1200, fullHeight: 800, offsetX: -130, offsetY: -40 });
  });

  it.each([
    { width: 1200, height: 800, portrait: false },
    { width: 320, height: 700, portrait: true },
  ])('uses welcome fallbacks for $width x $height', ({ width, height, portrait }) => {
    const { camera, rig } = setup();
    rig.update(frame({ mode: 'home', viewport: { width, height }, welcomeFrame: { x: 0, y: 0, diameter: 0 } }));
    const diameter = portrait ? width * 0.8 : height * 0.68;
    const distance = Math.min(
      260,
      PLANET_RADIUS / Math.sin(Math.atan((diameter / height) * Math.tan(MathUtils.degToRad(19)))),
    );
    expect(camera.position.length()).toBeCloseTo(distance, 10);
    expect(camera.view?.offsetX).toBeCloseTo(width / 2 - width * (portrait ? 0.5 : 0.68), 10);
    expect(camera.view?.offsetY).toBeCloseTo(height / 2 - height * 0.615, 10);
  });

  it('caps the welcome distance at 260', () => {
    const { camera, rig } = setup();
    rig.update(frame({ mode: 'home', welcomeFrame: { x: 100, y: 100, diameter: 1 } }));
    expect(camera.position.length()).toBeCloseTo(260, 10);
  });

  it.each([false, true])(
    'preserves authored chase dimensions, altitude and finished lookahead (portrait=%s)',
    portrait => {
      const { camera, rig } = setup('tour');
      const current = frame({
        finished: true,
        viewport: portrait ? { width: 320, height: 700 } : { width: 1200, height: 800 },
        vehicle: { ...frame().vehicle, altitude: 3, boosting: true },
      });
      rig.start(true);
      rig.update(current);
      expectVector(
        camera.position,
        new Vector3(0, -(portrait ? 10.2 : 8.4), PLANET_RADIUS + (portrait ? 13 : 11.8) + 0.9),
      );
      expectLook(camera, new Vector3(0, 0.2, PLANET_RADIUS + 0.3 + 0.4));
      expect(camera.fov).toBe(51);
      expect(camera.view?.offsetX).toBeCloseTo(0, 12);
      expect(camera.view?.offsetY).toBeCloseTo(0, 12);
    },
  );

  it.each([false, true])('preserves standard chase dimensions (portrait=%s)', portrait => {
    const { camera, rig } = setup(null);
    const current = frame({
      dt: 20,
      viewport: portrait ? { width: 320, height: 700 } : { width: 1200, height: 800 },
      vehicle: { ...frame().vehicle, altitude: 2 },
    });
    rig.update(current);
    expectVector(camera.position, new Vector3(0, -(portrait ? 13 : 10.2), PLANET_RADIUS + (portrait ? 10 : 7.8) + 0.6));
    expectLook(camera, new Vector3(0, 1.7, PLANET_RADIUS + 0.3));
  });

  it.each([false, true])('preserves airborne motion and boost FOV (reducedMotion=%s)', reducedMotion => {
    const { camera, rig } = setup('bay', reducedMotion);
    rig.start(true);
    rig.update(frame({ dt: 0.08, vehicle: { ...frame().vehicle, phase: 'airborne', altitude: 2, boosting: true } }));
    const airMotion = (1 - Math.exp(-5.5 * 0.08)) * (reducedMotion ? 0.25 : 1);
    expectVector(camera.position, new Vector3(0, -8.4 - airMotion * 1.4, PLANET_RADIUS + 11.8 + 0.6 + airMotion * 1.3));
    expectLook(camera, new Vector3(0, 1.3 + airMotion * 1.2, PLANET_RADIUS + 0.3 + 0.4));
    expect(camera.fov).toBeCloseTo(48 + (reducedMotion ? 0 : 3) + airMotion, 12);
  });

  it('removes orbit animation with reduced motion', () => {
    const early = setup('garden', true);
    const late = setup('garden', true);
    early.rig.update(frame({ mode: 'home', elapsed: 0 }));
    late.rig.update(frame({ mode: 'home', elapsed: 40 }));
    expectVector(early.camera.position, late.camera.position);
  });

  it('does not mutate borrowed vectors or frame data', () => {
    const { rig } = setup();
    const normal = Object.freeze(spherical(23, 15));
    const forward = Object.freeze(new Vector3(0, 1, 0).projectOnPlane(normal).normalize());
    const normalBefore = normal.clone();
    const forwardBefore = forward.clone();
    const upBefore = UP.clone();
    const current = Object.freeze(
      frame({
        dt: 0.08,
        vehicle: Object.freeze({ normal, forward, altitude: 1, boosting: true, phase: 'airborne' }),
        viewport: Object.freeze({ width: 320, height: 700 }),
        welcomeFrame: Object.freeze({ x: 160, y: 430, diameter: 240 }),
      }),
    );
    rig.update(current);
    rig.start(true);
    rig.update(current);
    rig.update(current);
    rig.recovered();
    rig.update(current);
    expectVector(normal, normalBefore);
    expectVector(forward, forwardBefore);
    expectVector(UP, upBefore);
  });
});

describe('CameraRig lifecycle', () => {
  it.each(prototypeIds)('keeps the initial %s start blended and smooth', prototypeId => {
    const { camera, rig } = setup(prototypeId);
    rig.update(frame({ mode: 'home' }));
    const before = camera.position.clone();
    rig.start(false);
    rig.update(frame());
    expectVector(camera.position, before);
    expect(camera.fov).toBe(38);
    rig.update(frame({ dt: 0.08 }));
    const homeBlend = Math.exp(-3.4 * 0.08);
    const follow = new Vector3(
      0,
      prototypeId === null ? -10.2 : -8.4,
      PLANET_RADIUS + (prototypeId === null ? 7.8 : 11.8),
    );
    const desired = follow.lerp(before, homeBlend);
    expectVector(camera.position, before.clone().lerp(desired, 1 - Math.exp(-5 * 0.08)));
    expect(camera.fov).toBeCloseTo(MathUtils.lerp(48, 38, homeBlend), 12);
  });

  it.each(['bay', 'station', 'garden', 'tour'] as const)('snaps only an authored %s replay to chase', prototypeId => {
    const { camera, rig } = setup(prototypeId);
    rig.update(frame({ mode: 'home' }));
    rig.start(true);
    rig.update(frame());
    expectVector(camera.position, new Vector3(0, -8.4, PLANET_RADIUS + 11.8));
    expectVector(camera.up, frame().vehicle.normal);
    expectLook(camera, new Vector3(0, 1.3, PLANET_RADIUS + 0.3));
    expect(camera.fov).toBe(48);
  });

  it('does not snap or clear the home blend on a standard replay', () => {
    const { camera, rig } = setup(null);
    rig.update(frame({ dt: 0.08 }));
    const before = camera.position.clone();
    const fov = camera.fov;
    rig.start(true);
    rig.update(frame({ vehicle: { ...frame().vehicle, normal: new Vector3(1, 0, 0) } }));
    expectVector(camera.position, before);
    expect(camera.fov).toBe(fov);
  });

  it.each(prototypeIds.flatMap(prototypeId => [false, true].map(replay => ({ prototypeId, replay }))))(
    'clears airborne blend on every start ($prototypeId, replay=$replay)',
    ({ prototypeId, replay }) => {
      const { camera, rig } = setup(prototypeId);
      rig.update(frame({ dt: 0.08, vehicle: { ...frame().vehicle, phase: 'airborne' } }));
      const homeBlend = prototypeId !== null && replay ? 0 : Math.exp(-3.4 * 0.08);
      rig.start(replay);
      rig.update(frame());
      expect(camera.fov).toBeCloseTo(MathUtils.lerp(48, 38, homeBlend), 12);
    },
  );

  it('snaps and clears airborne blend only when recovery is reported, not from the phase alone', () => {
    const { camera, rig } = setup();
    rig.start(true);
    rig.update(frame({ dt: 0.08, vehicle: { ...frame().vehicle, phase: 'airborne' } }));
    const before = camera.position.clone();
    const fov = camera.fov;
    const recoveredFrame = frame({
      vehicle: {
        normal: new Vector3(1, 0, 0),
        forward: new Vector3(0, 0, 1),
        altitude: 0,
        boosting: false,
        phase: 'recovering',
      },
    });
    rig.update(recoveredFrame);
    expectVector(camera.position, before);
    expect(camera.fov).toBe(fov);
    rig.recovered();
    rig.update(recoveredFrame);
    expectVector(camera.position, new Vector3(PLANET_RADIUS + 11.8, 0, -8.4));
    expectVector(camera.up, new Vector3(1, 0, 0));
    expectLook(camera, new Vector3(PLANET_RADIUS + 0.3, 0, 1.3));
    expect(camera.fov).toBe(48);
  });

  it('preserves home blend when recovery is reported during the initial transition', () => {
    const { camera, rig } = setup();
    rig.update(frame({ dt: 0.08, vehicle: { ...frame().vehicle, phase: 'airborne' } }));
    const homeBlend = Math.exp(-3.4 * 0.08);
    rig.recovered();
    rig.update(frame());
    const home = setup();
    home.rig.update(frame({ mode: 'home' }));
    expectVector(camera.position, new Vector3(0, -8.4, PLANET_RADIUS + 11.8).lerp(home.camera.position, homeBlend));
    expect(camera.fov).toBeCloseTo(MathUtils.lerp(48, 38, homeBlend), 12);
  });

  it.each(['home', 'complete'] as const)('returns to %s without resetting blends or snapping', mode => {
    const { camera, rig } = setup();
    rig.start(true);
    rig.update(frame({ dt: 0.08, vehicle: { ...frame().vehicle, phase: 'airborne' } }));
    const before = camera.position.clone();
    const fov = camera.fov;
    rig.update(frame({ mode }));
    expectVector(camera.position, before);
    expect(camera.fov).toBe(fov);
    rig.update(frame({ mode, dt: 0.08 }));
    const homeBlend = 1 - Math.exp(-3.4 * 0.08);
    const airBlend = (1 - Math.exp(-5.5 * 0.08)) * Math.exp(-5.5 * 0.08);
    expect(camera.fov).toBeCloseTo(MathUtils.lerp(48 + airBlend, 38, homeBlend), 12);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0);
    const returning = camera.position.clone();
    rig.start(false);
    rig.update(frame());
    expectVector(camera.position, returning);
    expect(camera.fov).toBeCloseTo(MathUtils.lerp(48, 38, homeBlend), 12);
  });

  it('uses the supplied dt for camera smoothing while paused', () => {
    const playing = setup();
    const paused = setup();
    for (const { rig } of [playing, paused]) {
      rig.start(true);
      rig.update(frame());
    }
    const before = paused.camera.position.clone();
    const next = frame({ dt: 0.08, vehicle: { ...frame().vehicle, altitude: 3, phase: 'airborne' } });
    playing.rig.update(next);
    paused.rig.update({ ...next, mode: 'paused' });
    expectVector(paused.camera.position, playing.camera.position);
    expectVector(paused.camera.up, playing.camera.up);
    expect(paused.camera.quaternion.angleTo(playing.camera.quaternion)).toBeLessThan(1e-7);
    expect(paused.camera.fov).toBe(playing.camera.fov);
    expect(paused.camera.position.distanceTo(before)).toBeGreaterThan(0);
  });
});
