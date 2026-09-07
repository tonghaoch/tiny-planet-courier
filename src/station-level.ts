import { Vector3 } from 'three';
import { AuthoredLevel, point, road, segmentDistance } from './authored-level';
import { PLANET_RADIUS as R, surfaceDistance } from './math';

const spawn = point(-11, 0);
const fork = point(-8.2, 0);
const pad = { center: point(0, 0), radius: 1.35 };
const outer = [spawn, fork, point(-7, -2.6), point(-5, -4.4), point(-2.5, -4.8), point(0.3, -4), point(1.7, -2.2), point(1.3, -0.8), pad.center];
const inner = [spawn, fork, point(-6.7, 0), point(-5.5, 1.7), point(-4.2, 1.7), point(-3.3, 0), point(-2.6, -1), point(-1, -1), pad.center];
const footprint = [point(-13, -6.6), point(4, -6.6), point(4, 5), point(-13, 5)];

export const STATION_LEVEL = {
  radius: R,
  anchor: { latitude: -10, longitude: 85 },
  footprintPolygon: footprint,
  landPolygon: footprint,
  waterPolygon: [],
  surfaceRadii: { ground: R + 0.075, road: R + 0.085, water: R + 0.025 },
  spawn: { position: spawn, heading: point(1, 0) },
  recovery: { position: spawn, heading: point(1, 0) },
  fork,
  pad,
  roads: { outer: road(outer, 2.3), inner: road(inner, 1.65) },
  outerRouteCenterline: outer,
  innerRouteCenterline: inner,
  station: { center: point(0, 2.65), facing: pad.center, colliderRadius: 1.05 },
  obstacles: [
    { center: point(-5, -1.3), radius: 1.1, kind: 'rock' },
    { center: point(-4.3, -2.3), radius: 0.8, kind: 'rock' },
    { center: point(-2, 1.3), radius: 1.0, kind: 'planter' },
    { center: point(-6, 3.5), radius: 0.7, kind: 'planter' },
  ],
  arrows: [
    { position: point(-7.65, -1.2), direction: point(0.6, -1.3), route: 'outer' },
    { position: point(-4.8, -4.43), direction: point(1, -0.16), route: 'outer' },
    { position: point(0.85, -3.3), direction: point(0.8, 1.1), route: 'outer' },
    { position: point(-7.2, 0), direction: point(1, 0), route: 'inner' },
    { position: point(-4.8, 1.7), direction: point(1, 0), route: 'inner' },
    { position: point(-3.25, -0.07), direction: point(0.7, -1), route: 'inner' },
  ],
  sceneryClearance: 1.4,
  overlayMaxEdge: 0.5,
  reactionDuration: 2.65,
  destination: { id: 'observatory', name: 'Stargaze Station', label: 'STARGAZE STATION', parcel: 'A letter from Earth', color: 0xc6b6ea },
} as const;

export type StationRoute = 'outer' | 'inner';

export class StationLevel extends AuthoredLevel {
  readonly outerRoute = this.route(outer);
  readonly innerRoute = this.route(inner);

  constructor() { super(STATION_LEVEL); }

  navigation(normal: Vector3, previous: StationRoute | null): { route: StationRoute | null; target: Vector3 } {
    const local = this.toLocal(normal);
    if (surfaceDistance(normal, this.destination.normal) < 2.3) return { route: previous, target: this.destination.normal };
    const distanceTo = (path: typeof outer) => Math.min(...path.slice(1).map((p, i) => segmentDistance(local, path[i], p)));
    const outerDistance = distanceTo(outer), innerDistance = distanceTo(inner);
    let choice = previous;
    if (local.x < fork.x - 0.4) choice = null;
    else if (outerDistance + 0.35 < innerDistance) choice = 'outer';
    else if (innerDistance + 0.35 < outerDistance) choice = 'inner';
    const route = choice === 'outer' ? this.outerRoute : this.innerRoute;
    let closest = 0, best = Infinity;
    route.forEach((p, i) => {
      const distance = surfaceDistance(normal, p);
      if (distance < best) { closest = i; best = distance; }
    });
    let ahead = Math.min(route.length - 1, closest + 1);
    while (ahead < route.length - 1 && surfaceDistance(normal, route[ahead]) < 1.8) ahead++;
    return { route: choice, target: route[ahead] };
  }
}
