import { CubicBezierCurve3, Vector3 } from 'three';
import { point, segmentDistance } from './authored-level';
import { BayLevel, type BayRoute } from './bay-level';
import { routeAhead, type NavigationContext, type RouteCursor } from './route-guidance';
import { StationLevel } from './station-level';
import { GardenLevel } from './garden-level';
import { RoadLevel, type RoadRoute } from './road-level';
import { PLANET_RADIUS, surfaceDistance, tangent, type Collider, type Destination } from './math';
import type { BayEnvironment, BaySurface, RampCrossing, SurfacePose } from './bay-types';

export type TourStopId = 'bay' | 'station' | 'garden';
export type TourStop = Stop<'bay', BayLevel> | Stop<'station', StationLevel> | Stop<'garden', GardenLevel>;
interface Stop<Id extends TourStopId, Level> {
  readonly id: Id;
  readonly level: Level;
  readonly destination: Destination;
  readonly entryPose: SurfacePose;
  readonly deliveredPose: SurfacePose;
}
export interface TourConnector {
  readonly from: number;
  readonly to: number;
  /** Unit normals, sampled at no more than 0.22 geodesic units. Render this path as-is. */
  readonly path: Vector3[];
  /** Full road width in geodesic units; sampling and scenery clearance use this too. */
  readonly width: number;
}
export interface TourRouteCache {
  readonly index: number;
  readonly route: RoadRoute | null;
  readonly bayRoute?: BayRoute | null;
  readonly phase?: 'transfer' | 'local';
  readonly normal?: Vector3;
  /** Full leg cursor; path identity also keys the selected variant. */
  readonly cursor?: RouteCursor | null;
  /** Locale-only cursor used by branch selection. */
  readonly localCursor?: RouteCursor | null;
}
export interface TourNavigation {
  target: Vector3;
  route: TourRouteCache;
  phase: 'transfer' | 'local';
}

const clonePose = (pose: SurfacePose): SurfacePose => ({ normal: pose.normal.clone(), forward: pose.forward.clone() });
const SPACING = 0.22;

/** Resample on great-circle segments, which are also the segments used by support. */
function samplePath(nodes: Vector3[]): Vector3[] {
  const result = [nodes[0].clone()];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1],
      b = nodes[i];
    const angle = surfaceDistance(a, b) / PLANET_RADIUS;
    const steps = Math.max(1, Math.ceil((angle * PLANET_RADIUS) / SPACING));
    const direction = tangent(b, a);
    for (let j = 1; j <= steps; j++) {
      result.push(
        j === steps
          ? b.clone()
          : a
              .clone()
              .multiplyScalar(Math.cos((angle * j) / steps))
              .addScaledVector(direction, Math.sin((angle * j) / steps))
              .normalize(),
      );
    }
  }
  return result;
}

/** Exact distance to the minor great-circle arcs of the publicly shared sampled path. */
function pathDistance(normal: Vector3, path: readonly Vector3[]): number {
  let bestDot = -1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const ab = Math.min(1, Math.max(-1, a.dot(b)));
    const sin = Math.sqrt(Math.max(0, 1 - ab * ab));
    const na = normal.dot(a),
      nb = normal.dot(b);
    bestDot = Math.max(bestDot, na, nb);
    if (sin < 1e-10) continue;
    const along = (nb - na * ab) / sin;
    // The projection lies between the segment's endpoints, not on its antipodal arc.
    if (along >= 0 && along * ab <= na * sin) bestDot = Math.max(bestDot, Math.hypot(na, along));
  }
  return Math.acos(Math.min(1, Math.max(-1, bestDot))) * PLANET_RADIUS;
}

/** One planet, three unchanged local courses, and visible, supported transfer roads. */
export class TourLayout {
  readonly stops: readonly [Stop<'bay', BayLevel>, Stop<'station', StationLevel>, Stop<'garden', GardenLevel>];
  readonly destinations: Destination[];
  readonly spawnPose: SurfacePose;
  readonly connectors: readonly TourConnector[];
  private readonly navigationPaths: readonly { wide: Vector3[]; short: Vector3[] }[];

  constructor() {
    const bay = new BayLevel({ latitude: 20, longitude: 0 });
    const station = new StationLevel({ latitude: -8, longitude: 125 });
    const garden = new GardenLevel({ latitude: 28, longitude: -115 });
    const stop = <Id extends TourStopId, Level extends BayLevel | StationLevel | GardenLevel>(
      id: Id,
      level: Level,
    ): Stop<Id, Level> => {
      const pad = level.definition.pad.center;
      const normal = level.destination.normal.clone();
      return {
        id,
        level,
        destination: { ...level.destination, normal: normal.clone() },
        entryPose: clonePose(level.spawnPose),
        deliveredPose: { normal, forward: tangent(level.toNormal(pad.x + 0.01, pad.y), normal) },
      };
    };
    this.stops = [stop('bay', bay), stop('station', station), stop('garden', garden)];
    this.destinations = this.stops.map(s => ({ ...s.destination, normal: s.destination.normal.clone() }));
    this.spawnPose = clonePose(this.stops[0].entryPose);
    const exits = [13.5, 5, 5.5];
    const entries = [-12.5, -14.5, -16.5];
    this.connectors = this.stops.map((from, index) => {
      const toIndex = (index + 1) % this.stops.length;
      const to = this.stops[toIndex];
      const exit = from.level.toNormal(exits[index], 0);
      const entry = to.level.toNormal(entries[toIndex], 0);
      // Tangent handles preserve eastward departure/arrival without a sharp exterior turn.
      const departure = tangent(from.level.toNormal(exits[index] + 0.01, 0), exit);
      const arrival = tangent(to.level.toNormal(entries[toIndex] + 0.01, 0), entry);
      const handle = Math.min(5, surfaceDistance(exit, entry) / 3);
      const curve = new CubicBezierCurve3(
        exit.clone().multiplyScalar(PLANET_RADIUS),
        exit.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(departure, handle),
        entry.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(arrival, -handle),
        entry.clone().multiplyScalar(PLANET_RADIUS),
      );
      const exterior = curve.getPoints(80).map(p => p.normalize());
      const outgoing = from.level.route([from.level.definition.pad.center, point(exits[index], 0)]);
      const incoming = to.level.route([point(entries[toIndex], 0), to.level.definition.spawn.position]);
      return {
        from: index,
        to: toIndex,
        width: 1.8,
        path: samplePath([...outgoing, ...exterior.slice(1), ...incoming.slice(1)]),
      };
    });
    // Share the incoming road across both guidance phases. The footprint is an
    // ownership boundary, not a place to jump 1.8 units past the locale's spawn.
    this.navigationPaths = this.stops.map((_, index) => ({
      wide: this.routeForLeg(index, 'wide'),
      short: this.routeForLeg(index, 'short'),
    }));
  }

  /** Never consult a locale's default-ground fallback until it owns this footprint. */
  sampleSurface(normal: Vector3): BaySurface {
    const owner = this.stops.find(stop => stop.level.isInFootprint(normal));
    const authored = owner?.level.sampleSurface(normal);
    if (authored && authored.kind !== 'ground') return authored;
    if (this.isOnConnector(normal)) return { kind: 'road', radius: PLANET_RADIUS + 0.085 };
    return authored ?? { kind: 'ground', radius: PLANET_RADIUS + 0.075 };
  }

  crossRampLip(previous: Vector3, next: Vector3): RampCrossing | null {
    const owner = this.stops.find(stop => stop.level.isInFootprint(previous));
    return owner?.level.crossRampLip(previous, next) ?? null;
  }

  isInFootprint(normal: Vector3): boolean {
    return this.stops.some(stop => stop.level.isInFootprint(normal));
  }

  isOnConnector(normal: Vector3, margin = 0): boolean {
    return this.connectors.some(
      connector => pathDistance(normal, connector.path) <= connector.width / 2 + margin + 1e-7,
    );
  }

  /** Reserve entire districts and road corridors, including the caller's scenery overhang. */
  isInSceneryClearance(normal: Vector3, margin = 1.5): boolean {
    return (
      this.stops.some(stop => stop.level.isInSceneryClearance(normal, margin)) || this.isOnConnector(normal, margin)
    );
  }

  /** Leg zero starts at Bay spawn; other legs include the preceding pad and transfer. */
  routeForLeg(index: number, variant: 'wide' | 'short'): Vector3[] {
    const stop = this.stops[index];
    if (!stop || !Number.isInteger(index)) throw new RangeError('Tour leg index must be 0, 1, or 2');
    const level = stop.level;
    const local =
      level instanceof BayLevel
        ? variant === 'wide'
          ? level.safeRoute
          : level.jumpRoute
        : variant === 'wide'
          ? level.outerRoute
          : level.innerRoute;
    const path = index === 0 ? local : [...this.connectors[index - 1].path, ...local.slice(1)];
    return path.map(p => p.clone());
  }

  /** Leg-keyed explicit state. Region hysteresis is navigation-only; it never
   * changes support/eligibility. Omit the cache to reset after recovery. */
  navigation(
    index: number,
    normal: Vector3,
    previousRoute: TourRouteCache | null,
    grounded: boolean,
    context: Pick<NavigationContext, 'forward'> = {},
  ): TourNavigation {
    if (!Number.isInteger(index) || index < 0 || index > this.stops.length)
      throw new RangeError('Invalid Tour navigation index');
    const stop = this.stops[index] ?? this.stops[0];
    const previous =
      previousRoute?.index === index && (!previousRoute.normal || surfaceDistance(normal, previousRoute.normal) < 3)
        ? previousRoute
        : null;
    let local = index < this.stops.length && (index === 0 || stop.level.isInFootprint(normal));
    if (index > 0 && index < this.stops.length && previous?.phase) {
      const p = stop.level.toLocal(normal),
        polygon = stop.level.definition.footprintPolygon;
      const boundary = Math.min(...polygon.map((a, i) => segmentDistance(p, a, polygon[(i + 1) % polygon.length])));
      if (boundary < 0.35) local = previous.phase === 'local';
    }
    const phase = local ? 'local' : 'transfer';
    const cache: TourRouteCache = {
      index,
      route: local ? (previous?.route ?? null) : null,
      bayRoute: local ? (previous?.bayRoute ?? null) : null,
      phase,
      normal: normal.clone(),
      cursor: null,
      localCursor: null,
    };
    if (!grounded) return { target: stop.destination.normal.clone(), route: cache, phase };
    let target: Vector3 | undefined;
    let route = cache.route,
      bayRoute = cache.bayRoute;
    let localCursor: RouteCursor | null = null;
    if (local) {
      const localContext = { ...context, cursor: previous?.phase === 'local' ? previous.localCursor : null };
      if (stop.level instanceof RoadLevel) {
        const navigation = stop.level.navigation(normal, route, localContext);
        target = navigation.target;
        route = navigation.route;
        localCursor = navigation.cursor;
      } else {
        const navigation = stop.level.navigation(normal, bayRoute, localContext);
        target = navigation.target;
        bayRoute = navigation.route;
        localCursor = navigation.cursor;
      }
    }
    if (index === 0)
      return { target: target!, route: { ...cache, route, bayRoute, cursor: localCursor, localCursor }, phase };
    const path =
      index === this.stops.length
        ? this.connectors[2].path
        : this.navigationPaths[index][route === 'outer' ? 'wide' : 'short'];
    const ahead = routeAhead(normal, path, previous?.cursor ?? null);
    return { target: ahead.target, route: { ...cache, route, bayRoute, cursor: ahead.cursor, localCursor }, phase };
  }

  createEnvironment(colliders: Collider[]): BayEnvironment {
    return {
      spawnPose: clonePose(this.spawnPose),
      recoveryPose: clonePose(this.stops[0].entryPose),
      colliders, // Keep the live array: scene construction appends colliders after this call.
      sampleSurface: normal => this.sampleSurface(normal),
      crossRampLip: (previous, next) => this.crossRampLip(previous, next),
    };
  }
}
