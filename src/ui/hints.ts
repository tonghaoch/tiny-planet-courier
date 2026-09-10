import { DELIVERY_RADIUS, DELIVERY_SPEED } from '../game';
import type { BayPhase } from '../bay-types';
import { PROTOTYPES, type PrototypeDefinition } from '../delivery-prototypes';
import type { TourStopId } from '../tour-layout';

export interface BayHUDState {
  phase: BayPhase;
  onRamp: boolean;
  onCoastalRoad: boolean;
  nearDestination: boolean;
  route?: 'outer' | 'inner' | null;
  stopId?: TourStopId;
  navigationPhase?: 'transfer' | 'local';
  checkpointLabel?: string;
  reverseToExit?: boolean;
  /** Explicit for legacy altitude-based driving as well as authored surfaces. */
  grounded?: boolean;
}

export interface MissionHintState {
  prototype: PrototypeDefinition | null;
  targetName: string;
  distance: number;
  speed: number;
  heading: number | null;
  arrival: boolean;
  driveState?: BayHUDState;
}

function currentLocale(prototype: PrototypeDefinition | null, driveState?: BayHUDState) {
  return prototype?.id === 'tour' && driveState?.stopId ? PROTOTYPES[driveState.stopId] : prototype;
}

export function missionHint({
  prototype,
  targetName,
  distance,
  speed,
  heading,
  arrival,
  driveState,
}: MissionHintState): string {
  const localPrototype = currentLocale(prototype, driveState);
  const recovering = driveState?.phase === 'recovering';
  let hint = 'Destination compass. Choose your own road.';
  if (prototype?.id === 'tour' && driveState?.phase === 'recovering') {
    hint = `Back at ${driveState.checkpointLabel}. Your deliveries are safe.`;
  } else if (prototype?.id === 'tour' && driveState?.navigationPhase === 'transfer') {
    hint = driveState.reverseToExit
      ? 'Next road is behind you. Reverse and turn gently.'
      : `Follow the connecting road to ${targetName}.`;
  } else if (localPrototype?.id === 'station' || localPrototype?.id === 'garden') {
    if (driveState?.phase === 'recovering') hint = localPrototype.hints.recovery;
    else if (distance >= DELIVERY_RADIUS) {
      const nearDestination = driveState?.nearDestination ?? distance < 2.6;
      hint = nearDestination
        ? localPrototype.hints.nearDestination
        : driveState?.route === 'outer'
          ? localPrototype.hints.outer
          : driveState?.route === 'inner'
            ? localPrototype.hints.inner
            : localPrototype.hints.choice;
    }
  } else if (localPrototype && driveState) {
    if (driveState.phase === 'recovering') hint = 'Back to the fork. Your parcel is safe.';
    else if (driveState.phase === 'airborne') hint = 'A little steer. Aim for the sand.';
    else if (driveState.onRamp) hint = localPrototype.hints.inner;
    else if (distance >= DELIVERY_RADIUS)
      hint = driveState.nearDestination
        ? localPrototype.hints.nearDestination
        : driveState.onCoastalRoad
          ? localPrototype.hints.outer
          : localPrototype.hints.choice;
  }
  // Arrival/recovery semantics override route hints, but never delivery eligibility.
  if (recovering) hint = 'Recovering. Your parcel is safe.';
  else if (arrival)
    hint =
      distance >= DELIVERY_RADIUS
        ? 'Move back into the ring to deliver.'
        : Math.abs(speed) >= DELIVERY_SPEED
          ? 'Brake to make your delivery.'
          : 'Hold still to deliver a little joy…';
  else if (heading === null) hint = 'Above the delivery. Land, then park.';
  return hint;
}

export function driveStateLabel(prototype: PrototypeDefinition | null, driveState?: BayHUDState): string | null {
  const localPrototype = currentLocale(prototype, driveState);
  if (!localPrototype || !driveState) return null;
  return driveState.phase === 'recovering'
    ? 'A fresh start'
    : driveState.navigationPhase === 'transfer'
      ? 'Connecting road'
      : localPrototype.id === 'bay' && driveState.phase === 'airborne'
        ? 'Airborne'
        : localPrototype.id === 'bay' && driveState.onRamp
          ? 'Ready to leap'
          : localPrototype.id === 'station' && driveState.route === 'inner'
            ? 'Tight turns'
            : localPrototype.id === 'station' && driveState.route === 'outer'
              ? 'Outer road'
              : localPrototype.id === 'garden' && driveState.route === 'inner'
                ? 'Flower path'
                : localPrototype.id === 'garden' && driveState.route === 'outer'
                  ? 'Garden loop'
                  : 'Cruising';
}
