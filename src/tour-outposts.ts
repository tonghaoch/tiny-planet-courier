import { CatmullRomCurve3, Vector3 } from 'three';
import { point, road, type AuthoredLevelDefinition, type LevelPoint } from './authored-level';
import { PLANET_RADIUS as R } from './math';
import { RoadLevel } from './road-level';

function flowingPath(nodes: readonly LevelPoint[]): LevelPoint[] {
  return new CatmullRomCurve3(
    nodes.map(p => new Vector3(p.x, p.y, 0)),
    false,
    'centripetal',
  )
    .getPoints(72)
    .map(p => point(p.x, p.y));
}
const spawn = point(-4, 0);
const pad = { center: point(3, 0), radius: 1.1 };
const outer = flowingPath([spawn, point(-2.8, 0), point(-1.4, -1.65), point(1, -1.65), pad.center]);
const inner = flowingPath([spawn, point(-2.8, 0), point(0, 0.45), point(1.8, 0.3), pad.center]);
const footprint = [point(-5, -3), point(5, -3), point(5, 3), point(-5, 3)];
const common = {
  radius: R,
  footprintPolygon: footprint,
  landPolygon: footprint,
  waterPolygon: [],
  surfaceRadii: { ground: R + 0.075, road: R + 0.085, water: R + 0.025 },
  spawn: { position: spawn, heading: point(1, 0) },
  recovery: { position: spawn, heading: point(1, 0) },
  fork: point(-2.8, 0),
  pad,
  roads: { outer: road(outer, 1.9), inner: road(inner, 1.65) },
  outerRouteCenterline: outer,
  innerRouteCenterline: inner,
  sceneryClearance: 1.5,
  overlayMaxEdge: 0.5,
  reactionDuration: 2.65,
  landmark: { center: point(0, 2.1), facing: pad.center, colliderRadius: 0.65 },
} as const;

export const BEACON_LEVEL = {
  ...common,
  anchor: { latitude: -55, longitude: 0 },
  destination: {
    id: 'beacon',
    name: 'Beacon Post',
    label: 'BEACON POST',
    parcel: 'A replacement lamp',
    color: 0xf5d58b,
  },
} as const;
export const DEPOT_LEVEL = {
  ...common,
  anchor: { latitude: -50, longitude: -135 },
  destination: {
    id: 'depot',
    name: 'Redrock Depot',
    label: 'REDROCK DEPOT',
    parcel: 'Repair supplies',
    color: 0xeaa78d,
  },
} as const;

export class BeaconLevel extends RoadLevel {
  constructor(anchor: AuthoredLevelDefinition['anchor'] = BEACON_LEVEL.anchor) {
    super({ ...BEACON_LEVEL, anchor: { ...anchor } });
  }
}
export class DepotLevel extends RoadLevel {
  constructor(anchor: AuthoredLevelDefinition['anchor'] = DEPOT_LEVEL.anchor) {
    super({ ...DEPOT_LEVEL, anchor: { ...anchor } });
  }
}
