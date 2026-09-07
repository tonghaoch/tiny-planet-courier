import type { Vector3 } from 'three';
import { headingTo, surfaceDistance } from '../../src/math';
import type { Controls } from '../../src/vehicle';

export interface PilotState {
  normal: Vector3;
  forward: Vector3;
  speed: number;
  phase: string;
  jumps: number;
  recoveries: number;
}

/** Test-only input driver. It steers the real controller; it never moves a pose. */
export function createBayPilot(route: Vector3[], destination: Vector3, shortcut: boolean) {
  let progress = 0;
  let recoveries = 0;
  let initialJumps = 0;
  return (state: PilotState): Controls => {
    if (state.recoveries !== recoveries) {
      recoveries = state.recoveries;
      initialJumps = state.jumps;
      progress = 0;
    }
    if (state.phase === 'recovering') return { throttle: 0, steer: 0, boost: false };
    const goalDistance = surfaceDistance(state.normal, destination);
    if (goalDistance < 0.82 && state.phase === 'grounded') {
      return { throttle: state.speed > 0.55 ? -1 : state.speed < -0.55 ? 1 : 0, steer: 0, boost: false };
    }
    let closest = progress;
    let closestDistance = Infinity;
    for (let i = Math.max(0, progress - 3); i < Math.min(route.length, progress + 32); i++) {
      const distance = surfaceDistance(state.normal, route[i]);
      if (distance < closestDistance) { closestDistance = distance; closest = i; }
    }
    progress = Math.max(progress, closest);
    let ahead = progress;
    const lookAhead = 1.35 + Math.min(5, Math.abs(state.speed)) * 0.14;
    while (ahead < route.length - 1 && surfaceDistance(state.normal, route[ahead]) < lookAhead) ahead++;
    const target = goalDistance < 2.5 ? destination : route[ahead];
    const angle = headingTo(state.normal, state.forward, target);
    const steer = Math.min(1, Math.max(-1, angle * 2.0));
    if (state.phase === 'airborne') return { throttle: 0, steer, boost: false };
    const boost = shortcut && state.jumps === initialJumps && goalDistance > 6;
    if (boost) return { throttle: 1, steer, boost: true };
    const desiredSpeed = goalDistance < 2.5 ? 1.9 : Math.max(1.8, 4.1 - Math.abs(angle) * 2.0);
    const throttle = state.speed > desiredSpeed + 0.4 ? -1 : state.speed < desiredSpeed - 0.12 ? 1 : 0;
    return { throttle, steer, boost: false };
  };
}
