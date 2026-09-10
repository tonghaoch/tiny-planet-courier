import { CatmullRomCurve3, Vector3 } from 'three';
import { point, road, type AuthoredLevelDefinition, type LevelPoint } from './authored-level';
import { RoadLevel, type RoadRoute } from './road-level';
import { PLANET_RADIUS as R } from './math';

function flowingPath(nodes: readonly LevelPoint[]): LevelPoint[] {
  const curve = new CatmullRomCurve3(
    nodes.map(p => new Vector3(p.x, p.y, 0)),
    false,
    'centripetal',
  );
  return curve.getPoints((nodes.length - 1) * 12).map(p => point(p.x, p.y));
}

const spawn = point(-13, 0);
const fork = point(-10, 0);
const pad = { center: point(0, 0), radius: 1.35 };
const outer = flowingPath([
  spawn,
  fork,
  point(-9.7, -2.8),
  point(-6.1, -4.6),
  point(-2.8, -5.1),
  point(0.5, -4.1),
  point(2.2, -2.1),
  point(1.8, -0.4),
  pad.center,
]);
const inner = flowingPath([
  spawn,
  fork,
  point(-8.3, 1.65),
  point(-6.4, 1.95),
  point(-4.7, 0.1),
  point(-3.1, -1.55),
  point(-1.45, -1.35),
  pad.center,
]);
const footprint = [
  point(-15, -4),
  point(-12, -7.2),
  point(-1, -7.2),
  point(4.5, -4),
  point(4.5, 3.5),
  point(1.5, 5.5),
  point(-10.5, 5.5),
  point(-15, 2.5),
];

function arrowAt(path: readonly LevelPoint[], fraction: number, route: RoadRoute) {
  const index = Math.round((path.length - 1) * fraction);
  const before = path[Math.max(0, index - 1)],
    after = path[Math.min(path.length - 1, index + 1)];
  return { position: path[index], direction: point(after.x - before.x, after.y - before.y), route };
}

export const GARDEN_LEVEL = {
  radius: R,
  anchor: { latitude: 48, longitude: -50 },
  footprintPolygon: footprint,
  landPolygon: footprint,
  waterPolygon: [],
  surfaceRadii: { ground: R + 0.075, road: R + 0.085, water: R + 0.025 },
  spawn: { position: spawn, heading: point(1, 0) },
  recovery: { position: spawn, heading: point(1, 0) },
  fork,
  pad,
  roads: { outer: road(outer, 2.4), inner: road(inner, 1.9) },
  outerRouteCenterline: outer,
  innerRouteCenterline: inner,
  windmill: { center: point(0, 2.8), facing: pad.center, colliderRadius: 0.85 },
  beds: [
    { center: point(-7, -1), radius: 1.25 },
    { center: point(-5.2, -2.5), radius: 0.8 },
    { center: point(-2.8, 1.6), radius: 1.1 },
    { center: point(-10.5, 3.8), radius: 0.75 },
  ],
  welcomeBed: { center: point(1.5, 1.8), radius: 0.6 },
  arrows: [
    arrowAt(outer, 0.23, 'outer'),
    arrowAt(outer, 0.47, 'outer'),
    arrowAt(outer, 0.72, 'outer'),
    arrowAt(inner, 0.23, 'inner'),
    arrowAt(inner, 0.48, 'inner'),
    arrowAt(inner, 0.72, 'inner'),
  ],
  sceneryClearance: 1.5,
  overlayMaxEdge: 0.5,
  reactionDuration: 2.85,
  destination: {
    id: 'windmill',
    name: 'Windmill Garden',
    label: 'WINDMILL GARDEN',
    parcel: 'Flower seeds for the gardener',
    color: 0x9bd6b3,
  },
} as const;

export class GardenLevel extends RoadLevel {
  constructor(anchor: AuthoredLevelDefinition['anchor'] = GARDEN_LEVEL.anchor) {
    super({ ...GARDEN_LEVEL, anchor: { ...anchor } });
  }
}
