import { describe, expect, it } from 'vitest';
import { DELIVERY_RADIUS, DELIVERY_SPEED } from '../game';
import { PROTOTYPES } from '../delivery-prototypes';
import { driveStateLabel, missionHint, type BayHUDState, type MissionHintState } from './hints';

const compass = 'Destination compass. Choose your own road.';
const grounded: BayHUDState = {
  phase: 'grounded',
  onRamp: false,
  onCoastalRoad: false,
  nearDestination: false,
};
const base: MissionHintState = {
  prototype: PROTOTYPES.bay,
  targetName: 'Next neighbor',
  distance: 5,
  speed: 0,
  heading: 0,
  arrival: false,
  driveState: grounded,
};

function drive(overrides: Partial<BayHUDState> = {}): BayHUDState {
  return { ...grounded, ...overrides };
}

describe('mission hint priority', () => {
  const cases: { name: string; state: Partial<MissionHintState>; expected: string }[] = [
    {
      name: 'standard compass ignores local road flags',
      state: { prototype: null, driveState: drive({ onRamp: true }) },
      expected: compass,
    },
    { name: 'Bay without drive state keeps compass', state: { driveState: undefined }, expected: compass },
    {
      name: 'Tour without drive state keeps compass',
      state: { prototype: PROTOTYPES.tour, driveState: undefined },
      expected: compass,
    },
    { name: 'Bay choice', state: {}, expected: PROTOTYPES.bay.hints.choice },
    {
      name: 'Bay coastal road',
      state: { driveState: drive({ onCoastalRoad: true }) },
      expected: PROTOTYPES.bay.hints.outer,
    },
    {
      name: 'Bay near destination beats coast',
      state: { driveState: drive({ nearDestination: true, onCoastalRoad: true }) },
      expected: PROTOTYPES.bay.hints.nearDestination,
    },
    {
      name: 'Bay ramp beats near destination and coast',
      state: { driveState: drive({ onRamp: true, nearDestination: true, onCoastalRoad: true }) },
      expected: PROTOTYPES.bay.hints.inner,
    },
    {
      name: 'Bay airborne beats ramp',
      state: { driveState: drive({ phase: 'airborne', onRamp: true }) },
      expected: 'A little steer. Aim for the sand.',
    },
    {
      name: 'Bay ramp still applies inside ring without arrival',
      state: { distance: 0, driveState: drive({ onRamp: true }) },
      expected: PROTOTYPES.bay.hints.inner,
    },
    {
      name: 'Bay route field alone does not select coast',
      state: { driveState: drive({ route: 'outer' }) },
      expected: PROTOTYPES.bay.hints.choice,
    },
    {
      name: 'Tour transfer beats local airborne and ramp',
      state: {
        prototype: PROTOTYPES.tour,
        driveState: drive({ stopId: 'bay', navigationPhase: 'transfer', phase: 'airborne', onRamp: true }),
      },
      expected: 'Follow the connecting road to Next neighbor.',
    },
    {
      name: 'Tour reverse exit beats transfer destination copy',
      state: {
        prototype: PROTOTYPES.tour,
        driveState: drive({
          stopId: 'station',
          navigationPhase: 'transfer',
          reverseToExit: true,
          nearDestination: true,
          route: 'inner',
        }),
      },
      expected: 'Next road is behind you. Reverse and turn gently.',
    },
    {
      name: 'Tour local phase ignores reverse exit',
      state: {
        prototype: PROTOTYPES.tour,
        driveState: drive({ stopId: 'garden', navigationPhase: 'local', reverseToExit: true, route: 'inner' }),
      },
      expected: PROTOTYPES.garden.hints.inner,
    },
    {
      name: 'standalone locale ignores stopId and transfer for hints',
      state: {
        prototype: PROTOTYPES.station,
        driveState: drive({ stopId: 'garden', navigationPhase: 'transfer', reverseToExit: true, route: 'outer' }),
      },
      expected: PROTOTYPES.station.hints.outer,
    },
    {
      name: 'Tour with no stopId retains Tour choice',
      state: { prototype: PROTOTYPES.tour },
      expected: PROTOTYPES.tour.hints.choice,
    },
    {
      name: 'generic recovery beats checkpoint, transfer, arrival and missing heading',
      state: {
        prototype: PROTOTYPES.tour,
        distance: 0,
        arrival: true,
        heading: null,
        driveState: drive({
          stopId: 'garden',
          phase: 'recovering',
          checkpointLabel: 'Garden approach',
          navigationPhase: 'transfer',
          reverseToExit: true,
        }),
      },
      expected: 'Recovering. Your parcel is safe.',
    },
    {
      name: 'generic recovery applies even without a prototype',
      state: { prototype: null, driveState: drive({ phase: 'recovering' }) },
      expected: 'Recovering. Your parcel is safe.',
    },
    {
      name: 'arrival outside ring beats transfer, speed and missing heading',
      state: {
        prototype: PROTOTYPES.tour,
        arrival: true,
        distance: DELIVERY_RADIUS,
        speed: DELIVERY_SPEED,
        heading: null,
        driveState: drive({ stopId: 'bay', navigationPhase: 'transfer' }),
      },
      expected: 'Move back into the ring to deliver.',
    },
    {
      name: 'arrival speed threshold beats ramp and missing heading',
      state: {
        arrival: true,
        distance: DELIVERY_RADIUS - 0.01,
        speed: DELIVERY_SPEED,
        heading: null,
        driveState: drive({ onRamp: true }),
      },
      expected: 'Brake to make your delivery.',
    },
    {
      name: 'reverse speed uses absolute value',
      state: { arrival: true, distance: 0, speed: -DELIVERY_SPEED },
      expected: 'Brake to make your delivery.',
    },
    {
      name: 'slow arrival beats missing heading',
      state: { arrival: true, distance: 0, speed: DELIVERY_SPEED - 0.01, heading: null },
      expected: 'Hold still to deliver a little joy…',
    },
    {
      name: 'missing heading beats airborne and ramp',
      state: { heading: null, driveState: drive({ phase: 'airborne', onRamp: true }) },
      expected: 'Above the delivery. Land, then park.',
    },
    {
      name: 'missing heading beats reverse transfer',
      state: {
        prototype: PROTOTYPES.tour,
        heading: null,
        driveState: drive({ navigationPhase: 'transfer', reverseToExit: true }),
      },
      expected: 'Above the delivery. Land, then park.',
    },
    {
      name: 'ring proximity does not independently activate arrival',
      state: { distance: 0, driveState: drive({ grounded: true }) },
      expected: compass,
    },
    {
      name: 'computed arrival is consumed without recalculating grounded state',
      state: { arrival: true, distance: 0, driveState: drive({ phase: 'airborne', grounded: false }) },
      expected: 'Hold still to deliver a little joy…',
    },
  ];

  it.each(cases)('$name', ({ state, expected }) => {
    expect(missionHint({ ...base, ...state })).toBe(expected);
  });

  describe.each(['station', 'garden'] as const)('%s local routes', id => {
    const prototype = PROTOTYPES[id];
    const cases: { name: string; state: Partial<MissionHintState>; expected: string }[] = [
      { name: 'choice without drive state', state: { driveState: undefined }, expected: prototype.hints.choice },
      {
        name: 'near fallback without drive state',
        state: { distance: 2.59, driveState: undefined },
        expected: prototype.hints.nearDestination,
      },
      {
        name: 'fallback excludes 2.6 boundary',
        state: { distance: 2.6, driveState: undefined },
        expected: prototype.hints.choice,
      },
      {
        name: 'explicit false beats near fallback',
        state: { distance: 2, driveState: drive({ route: 'outer', nearDestination: false }) },
        expected: prototype.hints.outer,
      },
      {
        name: 'near beats inner route',
        state: { driveState: drive({ route: 'inner', nearDestination: true }) },
        expected: prototype.hints.nearDestination,
      },
      {
        name: 'inner ignores Bay airborne and ramp flags',
        state: { driveState: drive({ route: 'inner', phase: 'airborne', onRamp: true }) },
        expected: prototype.hints.inner,
      },
      { name: 'outer route', state: { driveState: drive({ route: 'outer' }) }, expected: prototype.hints.outer },
      {
        name: 'null route ignores Bay coastal flag',
        state: { driveState: drive({ route: null, onCoastalRoad: true }) },
        expected: prototype.hints.choice,
      },
      {
        name: 'exact delivery boundary still selects route',
        state: { distance: DELIVERY_RADIUS, driveState: drive({ route: 'inner' }) },
        expected: prototype.hints.inner,
      },
      {
        name: 'inside ring without arrival keeps compass',
        state: { distance: DELIVERY_RADIUS - 0.01, driveState: drive({ route: 'inner' }) },
        expected: compass,
      },
      {
        name: 'generic recovery overrides locale recovery',
        state: { driveState: drive({ phase: 'recovering', route: 'inner' }) },
        expected: 'Recovering. Your parcel is safe.',
      },
      {
        name: 'Tour selects current stop locale',
        state: { prototype: PROTOTYPES.tour, driveState: drive({ stopId: id, route: 'inner' }) },
        expected: prototype.hints.inner,
      },
    ];
    it.each(cases)('$name', ({ state, expected }) => {
      expect(missionHint({ ...base, prototype, ...state })).toBe(expected);
    });
  });

  it('does not mutate its computed state', () => {
    const state = Object.freeze({ ...base, driveState: Object.freeze(drive({ onRamp: true })) });
    expect(missionHint(state)).toBe(PROTOTYPES.bay.hints.inner);
    expect(state.arrival).toBe(false);
  });
});

describe('drive-state label priority', () => {
  const cases: {
    name: string;
    prototype: MissionHintState['prototype'];
    driveState?: BayHUDState;
    expected: string | null;
  }[] = [
    {
      name: 'missing prototype leaves DOM unchanged',
      prototype: null,
      driveState: drive({ phase: 'recovering' }),
      expected: null,
    },
    { name: 'missing drive state leaves DOM unchanged', prototype: PROTOTYPES.bay, expected: null },
    { name: 'Tour missing drive state leaves DOM unchanged', prototype: PROTOTYPES.tour, expected: null },
    {
      name: 'recovery beats transfer and ramp',
      prototype: PROTOTYPES.bay,
      driveState: drive({ phase: 'recovering', navigationPhase: 'transfer', onRamp: true }),
      expected: 'A fresh start',
    },
    {
      name: 'transfer beats airborne and ramp',
      prototype: PROTOTYPES.bay,
      driveState: drive({ phase: 'airborne', navigationPhase: 'transfer', onRamp: true }),
      expected: 'Connecting road',
    },
    {
      name: 'airborne beats ramp',
      prototype: PROTOTYPES.bay,
      driveState: drive({ phase: 'airborne', onRamp: true }),
      expected: 'Airborne',
    },
    { name: 'Bay ramp', prototype: PROTOTYPES.bay, driveState: drive({ onRamp: true }), expected: 'Ready to leap' },
    {
      name: 'Bay does not use route labels',
      prototype: PROTOTYPES.bay,
      driveState: drive({ route: 'inner' }),
      expected: 'Cruising',
    },
    {
      name: 'Station inner ignores Bay flags',
      prototype: PROTOTYPES.station,
      driveState: drive({ route: 'inner', phase: 'airborne', onRamp: true }),
      expected: 'Tight turns',
    },
    {
      name: 'Station outer',
      prototype: PROTOTYPES.station,
      driveState: drive({ route: 'outer' }),
      expected: 'Outer road',
    },
    {
      name: 'Garden inner ignores Bay flags',
      prototype: PROTOTYPES.garden,
      driveState: drive({ route: 'inner', phase: 'airborne', onRamp: true }),
      expected: 'Flower path',
    },
    {
      name: 'Garden outer',
      prototype: PROTOTYPES.garden,
      driveState: drive({ route: 'outer' }),
      expected: 'Garden loop',
    },
    {
      name: 'Tour without stopId keeps generic label',
      prototype: PROTOTYPES.tour,
      driveState: drive({ onRamp: true, route: 'inner', phase: 'airborne' }),
      expected: 'Cruising',
    },
    {
      name: 'Tour Bay locale',
      prototype: PROTOTYPES.tour,
      driveState: drive({ stopId: 'bay', onRamp: true }),
      expected: 'Ready to leap',
    },
    {
      name: 'Tour Station locale',
      prototype: PROTOTYPES.tour,
      driveState: drive({ stopId: 'station', route: 'inner' }),
      expected: 'Tight turns',
    },
    {
      name: 'Tour Garden locale',
      prototype: PROTOTYPES.tour,
      driveState: drive({ stopId: 'garden', route: 'outer' }),
      expected: 'Garden loop',
    },
    {
      name: 'Tour transfer beats local route',
      prototype: PROTOTYPES.tour,
      driveState: drive({ stopId: 'garden', route: 'outer', navigationPhase: 'transfer' }),
      expected: 'Connecting road',
    },
    {
      name: 'standalone ignores foreign stopId',
      prototype: PROTOTYPES.station,
      driveState: drive({ stopId: 'garden', route: 'inner' }),
      expected: 'Tight turns',
    },
  ];
  it.each(cases)('$name', ({ prototype, driveState, expected }) => {
    expect(driveStateLabel(prototype, driveState)).toBe(expected);
  });
});
