import type { Vector3 } from 'three';
import { headingTo } from '../../src/math';
import type { Controls } from '../../src/vehicle';
import { createBayPilot, type PilotState } from './bay-pilot';

/** Continuous real-input driver, including the accepted wide-route reverse departure.
 * No pose, heading, speed, charge, clock, or controller mutation is performed here.
 */
export function createTourPilot(route: Vector3[], destination: Vector3, shortcut: boolean) {
  const pilot = createBayPilot(route, destination, shortcut);
  const exit = route[Math.min(10, route.length - 1)];
  let turning: boolean | undefined;
  return (state: PilotState): Controls => {
    const angle = headingTo(state.normal, state.forward, exit);
    turning ??= Math.abs(angle) > Math.PI / 2;
    if (turning) {
      if (Math.abs(angle) > 0.65) return { throttle: -1, steer: -Math.sign(angle), boost: false };
      turning = false;
    }
    return pilot(state);
  };
}
