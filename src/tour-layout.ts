import { CatmullRomCurve3, CubicBezierCurve3, Vector3 } from 'three';
import { point, segmentDistance } from './authored-level';
import { BayLevel, type BayRoute } from './bay-level';
import { routeAhead, type NavigationContext, type RouteCursor } from './route-guidance';
import { StationLevel } from './station-level';
import { GardenLevel } from './garden-level';
import { RoadLevel, type RoadRoute } from './road-level';
import { PLANET_RADIUS, spherical, surfaceDistance, tangent, type Collider, type Destination } from './math';
import { BeaconLevel, DepotLevel } from './tour-outposts';
import type { TourLocationId, TourPlan } from './tour-itinerary';
import type { BayEnvironment, BaySurface, RampCrossing, SurfacePose } from './bay-types';

export type TourStopId = TourLocationId;
export type TourStop =
  | Stop<'bay', BayLevel>
  | Stop<'station', StationLevel>
  | Stop<'garden', GardenLevel>
  | Stop<'beacon', BeaconLevel>
  | Stop<'depot', DepotLevel>;
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
  readonly legKey?: string;
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

/** Five physical courses, with an explicit directed transfer graph. */
export class TourLayout {
  readonly stops: readonly [
    Stop<'bay', BayLevel>,
    Stop<'station', StationLevel>,
    Stop<'garden', GardenLevel>,
    Stop<'beacon', BeaconLevel>,
    Stop<'depot', DepotLevel>,
  ];
  readonly destinations: Destination[];
  readonly spawnPose: SurfacePose;
  readonly connectors: readonly TourConnector[];
  private readonly paths = new Map<string, Vector3[]>();
  private readonly graphPaths = new Map<string, readonly TourConnector[]>();
  private readonly planPaths = new WeakMap<TourPlan, Map<string, Vector3[]>>();

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
    this.stops = [
      stop('bay', bay),
      stop('station', station),
      stop('garden', garden),
      stop('beacon', new BeaconLevel()),
      stop('depot', new DepotLevel()),
    ];
    this.destinations = this.stops.map(s => ({ ...s.destination, normal: s.destination.normal.clone() }));
    this.spawnPose = clonePose(this.stops[0].entryPose);
    const exits = [13.5, 5, 5.5];
    const entries = [-12.5, -14.5, -16.5];
    const northern = this.stops.slice(0, 3).map((from, index) => {
      const toIndex = (index + 1) % 3;
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
    const southern = (from: number, to: number, waypoints: Vector3[]): TourConnector => {
      const origin = this.stops[from].level;
      const destination = this.stops[to].level;
      const exitX = from === 1 ? 5 : 6.5;
      const entryX = to === 1 ? -14.5 : -6.5;
      const exit = origin.toNormal(exitX, 0);
      const entry = destination.toNormal(entryX, 0);
      const departure = origin.toNormal(exitX + 2, 0);
      const arrival = destination.toNormal(entryX - 2, 0);
      const exterior = new CatmullRomCurve3([exit, departure, ...waypoints, arrival, entry], false, 'centripetal')
        .getPoints(320)
        .map(n => n.normalize());
      return {
        from,
        to,
        width: 1.8,
        path: samplePath([
          ...origin.route([origin.definition.pad.center, point(exitX, 0)]),
          ...exterior.slice(1),
          ...destination.route([point(entryX, 0), destination.definition.spawn.position]).slice(1),
        ]),
      };
    };
    this.connectors = [
      ...northern,
      southern(1, 4, [spherical(-15, 155), spherical(-30, 170)]),
      southern(4, 3, [spherical(-42, -70)]),
      southern(3, 1, [spherical(-32, 52), spherical(-17, 58)]),
    ];
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

  location(id: TourStopId): TourStop {
    const stop = this.stops.find(stop => stop.id === id);
    if (!stop) throw new RangeError('Unknown Tour location');
    return stop;
  }

  private localPath(id: TourStopId, variant: 'wide' | 'short'): Vector3[] {
    const level = this.location(id).level;
    return level instanceof BayLevel
      ? variant === 'wide'
        ? level.safeRoute
        : level.jumpRoute
      : variant === 'wide'
        ? level.outerRoute
        : level.innerRoute;
  }

  private transitPath(id: TourStopId): Vector3[] {
    return this.localPath(id, id === 'bay' ? 'wide' : 'short');
  }

  /** Shortest directed graph path by actual road length, including safe local transit. */
  connectorsBetween(from: TourStopId, to: TourStopId): readonly TourConnector[] {
    const key = `${from}>${to}`;
    const cached = this.graphPaths.get(key);
    if (cached) return cached;
    const start = this.stops.indexOf(this.location(from));
    const end = this.stops.indexOf(this.location(to));
    const queue = [{ at: start, cost: 0, edges: [] as TourConnector[] }];
    const visited = new Set<number>();
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;
      if (current.at === end) {
        const edges = Object.freeze(current.edges);
        this.graphPaths.set(key, edges);
        return edges;
      }
      if (visited.has(current.at)) continue;
      visited.add(current.at);
      for (const edge of this.connectors.filter(edge => edge.from === current.at)) {
        const path = [...edge.path, ...this.transitPath(this.stops[edge.to].id)];
        const length = path.reduce((sum, n, i) => sum + (i ? surfaceDistance(path[i - 1], n) : 0), 0);
        queue.push({ at: edge.to, cost: current.cost + length, edges: [...current.edges, edge] });
      }
    }
    throw new RangeError('Unreachable Tour location');
  }

  /** Stable shared path. Bay transit always uses the coast, never a reversed leap. */
  routeBetween(from: TourStopId | 'spawn', to: TourStopId, variant: 'wide' | 'short'): Vector3[] {
    if (from === to) throw new RangeError('A delivery leg must change locations');
    const key = `${from}>${to}:${variant}`;
    const cached = this.paths.get(key);
    if (cached) return cached;
    const path: Vector3[] = [];
    const append = (part: Vector3[]) => path.push(...(path.length ? part.slice(1) : part).map(n => n.clone()));
    if (from === 'spawn' && to !== 'bay') append(this.localPath('bay', 'wide'));
    const edges = this.connectorsBetween(from === 'spawn' ? 'bay' : from, to);
    for (let i = 0; i < edges.length; i++) {
      append(edges[i].path);
      if (i < edges.length - 1) append(this.transitPath(this.stops[edges[i].to].id));
    }
    append(this.localPath(to, variant));
    this.paths.set(key, path);
    return path;
  }

  /** Pass a plan for occurrence indices. Omission retains the old three-leg inspection API. */
  routeForLeg(index: number, variant: 'wide' | 'short', plan?: TourPlan): Vector3[] {
    const order = plan?.order ?? (['bay', 'station', 'garden'] as const);
    if (!Number.isInteger(index) || !order[index]) throw new RangeError('Invalid Tour leg index');
    if (!plan)
      return this.routeBetween(index === 0 ? 'spawn' : order[index - 1], order[index], variant).map(n => n.clone());
    let paths = this.planPaths.get(plan);
    if (!paths) {
      paths = new Map();
      this.planPaths.set(plan, paths);
    }
    const key = `${index}:${variant}`;
    if (!paths.has(key))
      paths.set(
        key,
        this.routeBetween(index === 0 ? 'spawn' : order[index - 1], order[index], variant).map(n => n.clone()),
      );
    return paths.get(key)!;
  }

  /** Leg-keyed explicit state. Region hysteresis is navigation-only; it never
   * changes support/eligibility. Omit the cache to reset after recovery. */
  navigation(
    index: number,
    normal: Vector3,
    previousRoute: TourRouteCache | null,
    grounded: boolean,
    context: Pick<NavigationContext, 'forward'> = {},
    plan?: TourPlan,
  ): TourNavigation {
    const order = plan?.order ?? (['bay', 'station', 'garden'] as const);
    if (!Number.isInteger(index) || index < 0 || index > order.length)
      throw new RangeError('Invalid Tour navigation index');
    const stop = this.location(order[index] ?? (plan ? order[order.length - 1] : 'bay'));
    const legKey = `${plan ? `${plan.version}:${plan.seed}:${order.join('.')}` : 'legacy'}:${index}`;
    const previous =
      previousRoute?.index === index &&
      (!previousRoute.legKey || previousRoute.legKey === legKey) &&
      (!previousRoute.normal || surfaceDistance(normal, previousRoute.normal) < 3)
        ? previousRoute
        : null;
    let local = index < order.length && stop.level.isInFootprint(normal);
    if (index < order.length && previous?.phase) {
      const p = stop.level.toLocal(normal),
        polygon = stop.level.definition.footprintPolygon;
      const boundary = Math.min(...polygon.map((a, i) => segmentDistance(p, a, polygon[(i + 1) % polygon.length])));
      if (boundary < 0.35) local = previous.phase === 'local';
    }
    const phase = local ? 'local' : 'transfer';
    const cache: TourRouteCache = {
      index,
      legKey,
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
    if (index === order.length && plan) return { target: stop.destination.normal.clone(), route: cache, phase };
    if (index === 0 && stop.id === 'bay' && local)
      return { target: target!, route: { ...cache, route, bayRoute, cursor: localCursor, localCursor }, phase };
    const variant = !local
      ? 'wide'
      : stop.level instanceof BayLevel
        ? bayRoute === 'coast'
          ? 'wide'
          : 'short'
        : route === 'outer'
          ? 'wide'
          : 'short';
    const path =
      index === order.length
        ? this.connectors[2].path
        : plan
          ? this.routeForLeg(index, variant, plan)
          : this.routeBetween(index === 0 ? 'spawn' : order[index - 1], stop.id, variant);
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
