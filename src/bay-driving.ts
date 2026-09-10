import { Vector3 } from 'three';
import { advanceOnSphere, PLANET_RADIUS, surfaceDistance, tangent } from './math';
import type { BayDriveEvent, BayEnvironment, BayPhase, BaySurface, LandingPrediction, SurfacePose } from './bay-types';

export const BAY_DRIVING_TUNING = Object.freeze({
  baselineRadius: PLANET_RADIUS + 0.085,
  cruiseSpeed: 4.7,
  boostSpeed: 7.8,
  reverseSpeed: 1.9,
  driveResponse: 1.8,
  boostResponse: 2.1,
  reverseResponse: 1.8,
  coastDrag: 1,
  braking: 11,
  stopSpeed: 0.015,
  steerResponse: 8,
  groundSteerRate: 1.65,
  boostSteerMultiplier: 0.82,
  airSteerRate: 0.3,
  maxAirTurn: 0.23,
  gravity: 6.8,
  launchSpeed: 3,
  launchAlignment: 0.8,
  supportDrop: 0.12,
  boostDrain: 0.36,
  boostRecharge: 0.15,
  boostStartCharge: 0.12,
  boostMinimumSpeed: 0.9,
  recoverySeconds: 0.5,
  impactDecay: 9,
  vehicleRadius: 0.31,
  collisionCooldown: 0.35,
  maxDelta: 0.1,
  step: 1 / 120,
  predictionHorizon: 4,
});

const T = BAY_DRIVING_TUNING;
const EPSILON = 1e-9;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const input = (value: number) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);
const damp = (value: number, target: number, rate: number, dt: number) =>
  target + (value - target) * Math.exp(-rate * dt);
type Controls = { throttle: number; steer: number; boost: boolean };

interface FlightState {
  normal: Vector3;
  forward: Vector3;
  speed: number;
  contactRadius: number;
  radialSpeed: number;
  steer: number;
  airTurn: number;
}

interface Touchdown {
  surface: BaySurface;
  time: number;
  radialSpeed: number;
}

/** Mutates only the supplied motion state. Live flight and prediction share this path. */
function advanceFlight(
  environment: BayEnvironment,
  state: FlightState,
  dt: number,
  steerInput: number,
): Touchdown | null {
  state.steer = damp(state.steer, steerInput, T.steerResponse, dt);
  const turn = clamp(state.airTurn - state.steer * T.airSteerRate * dt, -T.maxAirTurn, T.maxAirTurn);
  state.forward.applyAxisAngle(state.normal, turn - state.airTurn);
  state.airTurn = turn;

  const startNormal = state.normal.clone();
  const startForward = state.forward.clone();
  const radius = state.contactRadius;
  const radialSpeed = state.radialSpeed;
  const radiusAt = (time: number) => radius + radialSpeed * time - 0.5 * T.gravity * time * time;
  const normalAt = (time: number) => {
    const normal = startNormal.clone();
    advanceOnSphere(normal, startForward.clone(), state.speed * time);
    return normal;
  };

  advanceOnSphere(state.normal, state.forward, state.speed * dt);
  state.contactRadius = radiusAt(dt);
  state.radialSpeed = radialSpeed - T.gravity * dt;
  const surface = environment.sampleSurface(state.normal);
  // Water is a contact plane, not an aerial trigger. Ascending vans cannot land.
  if (state.radialSpeed >= 0 || state.contactRadius > surface.radius + EPSILON) return null;

  let low = clamp(radialSpeed / T.gravity, 0, dt);
  let high = dt;
  const gapAt = (time: number) => radiusAt(time) - environment.sampleSurface(normalAt(time)).radius;
  if (gapAt(low) <= EPSILON) high = low;
  else {
    // Bisection also finds the edge of a raised landing platform, rather than
    // reporting the end-of-frame footprint beyond the actual contact.
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (gapAt(middle) <= EPSILON) high = middle;
      else low = middle;
    }
  }
  state.normal.copy(startNormal);
  state.forward.copy(startForward);
  advanceOnSphere(state.normal, state.forward, state.speed * high);
  const contact = environment.sampleSurface(state.normal);
  state.contactRadius = contact.radius;
  state.radialSpeed = radialSpeed - T.gravity * high;
  return { surface: contact, time: high, radialSpeed: state.radialSpeed };
}

export class BayDrive {
  readonly normal = new Vector3();
  readonly forward = new Vector3();
  speed = 0;
  charge = 1;
  /** Signed height relative to the baseline road, not a grounded/airborne test. */
  altitude = 0;
  /** Absolute tire-contact radius; the view supplies its own chassis offset. */
  contactRadius = T.baselineRadius;
  radialSpeed = 0;
  boosting = false;
  phase: BayPhase = 'grounded';
  steer = 0;
  acceleration = 0;
  groundPitch = 0;
  impact = 0;
  recoveries = 0;
  jumps = 0;
  landings = 0;

  private airTurn = 0;
  private boostExhausted = false;
  private lipLatched = false;
  private recoveryRemaining = 0;
  private collisionRemaining = 0;
  private pendingEvents: BayDriveEvent[] = [];

  constructor(readonly environment: BayEnvironment) {
    this.reset();
  }

  reset(): void {
    this.pendingEvents = [];
    this.recoveries = 0;
    this.jumps = 0;
    this.landings = 0;
    this.placeAt(this.environment.spawnPose);
  }

  /** Manual retry is immediate; automatic splash recovery uses the same pose. */
  recover(): void {
    this.placeAt(this.environment.recoveryPose);
    this.recoveries++;
    this.pendingEvents.push(this.event('recovered', 1));
  }

  update(dt: number, controls: Controls): BayDriveEvent[] {
    const events = this.pendingEvents.splice(0);
    if (!Number.isFinite(dt) || dt <= 0) return events;
    const duration = Math.min(dt, T.maxDelta);
    const clean: Controls = {
      throttle: input(controls.throttle),
      steer: input(controls.steer),
      boost: controls.boost === true,
    };
    // Bound both time debt and support-sampling distance after a paused tab.
    const count = Math.ceil(duration / T.step);
    const step = duration / count;
    for (let i = 0; i < count; i++) {
      this.impact *= Math.exp(-T.impactDecay * step);
      this.collisionRemaining = Math.max(0, this.collisionRemaining - step);
      if (!clean.boost) this.boostExhausted = false;
      if (this.phase === 'recovering') this.stepRecovery(step, events);
      else if (this.phase === 'airborne') {
        this.charge = Math.min(1, this.charge + T.boostRecharge * step);
        this.stepAir(step, clean.steer, events);
      } else this.stepGround(step, clean, events);
      this.altitude = this.contactRadius - T.baselineRadius;
    }
    return events;
  }

  predictLanding(): LandingPrediction | null {
    if (this.phase !== 'airborne') return null;
    const state = this.flightState(true);
    let elapsed = 0;
    while (elapsed < T.predictionHorizon - EPSILON) {
      const dt = Math.min(T.step, T.predictionHorizon - elapsed);
      const contact = advanceFlight(this.environment, state, dt, 0);
      if (contact)
        return {
          normal: state.normal.clone(),
          radius: contact.surface.radius,
          kind: contact.surface.kind,
          time: elapsed + contact.time,
        };
      elapsed += dt;
    }
    return null;
  }

  private placeAt(pose: SurfacePose): void {
    // Never take ownership of vectors supplied by the world/checkpoint.
    this.normal.copy(pose.normal).normalize();
    this.forward.copy(tangent(pose.forward, this.normal));
    const support = this.environment.sampleSurface(this.normal);
    this.contactRadius = support.radius;
    this.altitude = this.contactRadius - T.baselineRadius;
    this.phase = support.kind === 'water' ? 'airborne' : 'grounded';
    this.speed = 0;
    this.radialSpeed = 0;
    this.charge = 1;
    this.boosting = false;
    this.steer = 0;
    this.acceleration = 0;
    this.impact = 0;
    this.airTurn = 0;
    this.boostExhausted = false;
    this.lipLatched = false;
    this.recoveryRemaining = 0;
    this.collisionRemaining = 0;
    this.setGroundPitch(support);
  }

  private event(type: BayDriveEvent['type'], strength: number): BayDriveEvent {
    return { type, normal: this.normal.clone(), strength: clamp(strength, 0, 1) };
  }

  private setGroundPitch(surface: BaySurface): void {
    this.groundPitch =
      surface.kind === 'ramp' && surface.rampSlope !== undefined
        ? Math.atan(surface.rampSlope * this.forward.dot(tangent(surface.rampForward ?? this.forward, this.normal)))
        : 0;
  }

  private startFalling(): void {
    this.phase = 'airborne';
    this.radialSpeed = 0;
    this.airTurn = 0;
    this.boosting = false;
    this.groundPitch = 0;
    this.acceleration = 0;
  }

  private stepGround(dt: number, controls: Controls, events: BayDriveEvent[]): void {
    const support = this.environment.sampleSurface(this.normal);
    if (support.kind === 'water' || this.contactRadius - support.radius > T.supportDrop) {
      this.startFalling();
      this.stepAir(dt, controls.steer, events);
      return;
    }
    this.contactRadius = support.radius;
    if (support.kind !== 'ramp' || (support.rampProgress ?? 1) < 0.8) this.lipLatched = false;

    const boosting =
      controls.boost &&
      !this.boostExhausted &&
      controls.throttle > 0 &&
      this.speed > T.boostMinimumSpeed &&
      this.charge > 0 &&
      (this.boosting || this.charge >= T.boostStartCharge);
    if (boosting && !this.boosting) events.push(this.event('boost', 1));
    this.boosting = boosting;
    this.charge = clamp(this.charge + dt * (boosting ? -T.boostDrain : T.boostRecharge), 0, 1);
    if (boosting && this.charge === 0) {
      // Recharge while held is allowed, but exhaustion requires a release to
      // re-arm. This avoids a sawtooth of tiny boost pulses near empty.
      this.boostExhausted = true;
      this.boosting = false;
    }

    const oldSpeed = this.speed;
    if (controls.throttle * this.speed < 0) {
      this.speed =
        Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - T.braking * Math.abs(controls.throttle) * dt);
    } else if (controls.throttle > 0) {
      this.speed = damp(
        this.speed,
        controls.throttle * (boosting ? T.boostSpeed : T.cruiseSpeed),
        boosting ? T.boostResponse : T.driveResponse,
        dt,
      );
    } else if (controls.throttle < 0) {
      this.speed = damp(this.speed, controls.throttle * T.reverseSpeed, T.reverseResponse, dt);
    } else this.speed *= Math.exp(-T.coastDrag * dt);
    if (Math.abs(this.speed) < T.stopSpeed) this.speed = 0;
    this.acceleration = (this.speed - oldSpeed) / dt;
    this.steer = damp(this.steer, controls.steer, T.steerResponse, dt);
    const rate = T.groundSteerRate * Math.min(1, Math.abs(this.speed) / 2) * (boosting ? T.boostSteerMultiplier : 1);
    this.forward.applyAxisAngle(this.normal, -this.steer * rate * dt * (this.speed < 0 ? -1 : 1));

    const previous = this.normal.clone();
    const heading = this.forward.clone();
    const next = previous.clone();
    const nextForward = heading.clone();
    advanceOnSphere(next, nextForward, this.speed * dt);
    const crossing = this.environment.crossRampLip(previous, next);
    if (crossing && !this.lipLatched && this.speed >= T.launchSpeed && crossing.pitch > 0) {
      const fraction = clamp(crossing.fraction, 0, 1);
      const lipHeading = heading.clone();
      advanceOnSphere(previous.clone(), lipHeading, this.speed * dt * fraction);
      const rampForward = tangent(crossing.forward, crossing.normal);
      const facing = tangent(lipHeading, crossing.normal);
      const movement = next.clone().sub(previous);
      const forwardCrossing =
        movement.lengthSq() > 1e-16 && tangent(movement, crossing.normal).dot(rampForward) >= T.launchAlignment;
      if (forwardCrossing && facing.dot(rampForward) >= T.launchAlignment) {
        this.normal.copy(crossing.normal);
        this.forward.copy(facing);
        this.contactRadius = crossing.radius;
        const pitch = clamp(crossing.pitch, 0, Math.PI / 2);
        this.startFalling();
        this.radialSpeed = this.speed * Math.sin(pitch);
        this.speed *= Math.cos(pitch);
        this.lipLatched = true;
        this.jumps++;
        events.push(this.event('launch', this.speed / T.boostSpeed));
        const remaining = dt * (1 - fraction);
        if (remaining > EPSILON) this.stepAir(remaining, controls.steer, events);
        return;
      }
    }

    const nextSupport = this.environment.sampleSurface(next);
    const unsupported = (surface: BaySurface) =>
      surface.kind === 'water' || support.radius - surface.radius > T.supportDrop;
    if (unsupported(nextSupport)) {
      // Locate departure separately from touchdown: starting a fall at the old
      // grounded point would immediately re-land on that same piece of ramp.
      let low = 0;
      let high = 1;
      let edgeSupport = support;
      for (let i = 0; i < 24; i++) {
        const fraction = (low + high) / 2;
        const point = previous.clone();
        advanceOnSphere(point, heading.clone(), this.speed * dt * fraction);
        const sample = this.environment.sampleSurface(point);
        if (unsupported(sample)) high = fraction;
        else {
          low = fraction;
          edgeSupport = sample;
        }
      }
      this.normal.copy(previous);
      this.forward.copy(heading);
      advanceOnSphere(this.normal, this.forward, this.speed * dt * high);
      this.contactRadius = edgeSupport.radius;
      this.startFalling();
      const remaining = dt * (1 - high);
      if (remaining > EPSILON) this.stepAir(remaining, controls.steer, events);
      return;
    }

    this.normal.copy(next);
    this.forward.copy(nextForward);
    this.contactRadius = nextSupport.radius;
    this.radialSpeed = 0;
    this.collide(events);
    this.setGroundPitch(this.environment.sampleSurface(this.normal));
  }

  private flightState(copy: boolean): FlightState {
    return {
      normal: copy ? this.normal.clone() : this.normal,
      forward: copy ? this.forward.clone() : this.forward,
      speed: this.speed,
      contactRadius: this.contactRadius,
      radialSpeed: this.radialSpeed,
      steer: this.steer,
      airTurn: this.airTurn,
    };
  }

  private stepAir(dt: number, steerInput: number, events: BayDriveEvent[]): void {
    this.boosting = false;
    this.acceleration = 0;
    this.groundPitch = 0;
    const state = this.flightState(false);
    const contact = advanceFlight(this.environment, state, dt, steerInput);
    this.contactRadius = state.contactRadius;
    this.radialSpeed = state.radialSpeed;
    this.steer = state.steer;
    this.airTurn = state.airTurn;
    if (!contact) return;

    const strength = clamp(Math.abs(contact.radialSpeed) / T.boostSpeed, 0, 1);
    this.radialSpeed = 0;
    if (contact.surface.kind === 'water') {
      events.push(this.event('splash', strength));
      this.phase = 'recovering';
      this.speed = 0;
      this.recoveryRemaining = T.recoverySeconds;
      this.stepRecovery(dt - contact.time, events);
    } else {
      this.phase = 'grounded';
      this.impact = strength;
      this.landings++;
      this.setGroundPitch(contact.surface);
      events.push(this.event('land', strength));
    }
  }

  private stepRecovery(dt: number, events: BayDriveEvent[]): void {
    this.recoveryRemaining -= dt;
    if (this.recoveryRemaining > EPSILON) return;
    this.placeAt(this.environment.recoveryPose);
    this.recoveries++;
    events.push(this.event('recovered', 1));
  }

  private collide(events: BayDriveEvent[]): void {
    for (const collider of this.environment.colliders) {
      const distance = surfaceDistance(this.normal, collider.normal);
      const clearance = collider.radius + T.vehicleRadius;
      if (distance >= clearance) continue;
      const toward = tangent(collider.normal, this.normal);
      const approach = Math.max(0, this.speed * this.forward.dot(toward));
      const away =
        distance < 1e-6
          ? tangent(this.forward.clone().negate(), collider.normal)
          : tangent(this.normal, collider.normal);
      const corrected = collider.normal.clone();
      advanceOnSphere(corrected, away, clearance + 1e-5);
      this.normal.copy(corrected);
      this.forward.copy(tangent(this.forward, this.normal));
      if (approach > 0) this.speed = -Math.sign(this.speed) * Math.min(0.7, Math.abs(this.speed) * 0.12);
      if (approach > 0.5 && this.collisionRemaining <= 0) {
        events.push(this.event('collision', approach / T.boostSpeed));
        this.collisionRemaining = T.collisionCooldown;
      }
      const support = this.environment.sampleSurface(this.normal);
      if (support.kind !== 'water' && this.contactRadius - support.radius <= T.supportDrop)
        this.contactRadius = support.radius;
    }
  }
}
