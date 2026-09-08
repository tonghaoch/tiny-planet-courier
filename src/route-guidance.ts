import { Vector3 } from 'three';
import { PLANET_RADIUS, tangent } from './math';

/** Explicit snapshot, owned by the caller. Discard on recovery/restart. Path identity
 * prevents a cursor from leaking across branches, levels, or regenerated routes. */
export interface RouteCursor {
  readonly path: readonly Vector3[];
  readonly segment: number;
  readonly progress: number;
  readonly normal: Vector3;
}
export interface NavigationContext {
  readonly forward?: Vector3;
  readonly cursor?: RouteCursor | null;
  readonly grounded?: boolean;
}
export interface RouteProjection {
  readonly point: Vector3;
  readonly segment: number;
  readonly progress: number;
  readonly distance: number;
}
export interface RouteAhead extends RouteProjection {
  readonly target: Vector3;
  readonly targetProgress: number;
  readonly length: number;
  readonly cursor: RouteCursor;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const angle = (a: Vector3, b: Vector3) => Math.atan2(new Vector3().crossVectors(a, b).length(), a.dot(b));

function segments(normal: Vector3, path: readonly Vector3[], radius: number) {
  if (!path.length) throw new RangeError('Navigation path must not be empty');
  const n = normal.clone().normalize();
  const projections: RouteProjection[] = [];
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1].clone().normalize(), b = path[i].clone().normalize();
    const arc = angle(a, b);
    const direction = b.clone().addScaledVector(a, -a.dot(b));
    if (arc > Math.PI - 1e-8) throw new RangeError('Navigation segments must be shorter than a hemisphere');
    direction.normalize();
    // Maximise n dot (a*cos(t) + direction*sin(t)) on the minor arc.
    const projected = Math.atan2(n.dot(direction), n.dot(a));
    let along = n.dot(a) >= n.dot(b) ? 0 : arc;
    if (projected >= 0 && projected <= arc) along = projected;
    const point = a.clone().multiplyScalar(Math.cos(along)).addScaledVector(direction, Math.sin(along)).normalize();
    projections.push({ point, segment: i - 1, progress: lengths[i - 1] + along * radius, distance: angle(n, point) * radius });
    lengths.push(lengths[i - 1] + arc * radius);
  }
  if (!projections.length) {
    const point = path[0].clone().normalize();
    projections.push({ point, segment: 0, progress: 0, distance: angle(n, point) * radius });
  }
  return { projections, lengths, normal: n };
}

/** Exact minor-great-circle projection, in geodesic world units. No sample snapping. */
export function projectOnRoute(normal: Vector3, path: readonly Vector3[], radius = PLANET_RADIUS): RouteProjection {
  return segments(normal, path, radius).projections.reduce((best, p) => p.distance < best.distance ? p : best);
}

/** Look ahead by arc length, not chord distance. A nearby cursor breaks competing
 * segment ties, but never forces monotonic progress: reversing can decrease it.
 * Stronger geometric evidence, >1.8 off-route distance, or >3 units of motion
 * releases tracking. All returned vectors are fresh; no hidden state advances. */
export function routeAhead(normal: Vector3, path: readonly Vector3[], cursor: RouteCursor | null = null, lookahead = 1.8, radius = PLANET_RADIUS): RouteAhead {
  const data = segments(normal, path, radius);
  let projection = data.projections.reduce((best, p) => p.distance < best.distance ? p : best);
  if (cursor?.path === path && Number.isFinite(cursor.progress)) {
    const movement = angle(data.normal, cursor.normal) * radius;
    if (movement < 3 && projection.distance < 1.8) {
      const nearby = data.projections.filter(p => Math.abs(p.progress - cursor.progress) <= movement + 0.5);
      const tracked = nearby.reduce<RouteProjection | null>((best, p) => !best || p.distance < best.distance ? p : best, null);
      if (tracked && tracked.distance <= projection.distance + 0.2) projection = tracked;
    }
  }
  const length = data.lengths.at(-1)!;
  const targetProgress = clamp(projection.progress + Math.max(0, lookahead), 0, length);
  let i = 0;
  while (i < path.length - 2 && data.lengths[i + 1] < targetProgress) i++;
  let target = path.at(-1)!.clone().normalize();
  if (i < path.length - 1) {
    const a = path[i].clone().normalize(), b = path[i + 1].clone().normalize();
    const along = (targetProgress - data.lengths[i]) / radius;
    const direction = b.clone().addScaledVector(a, -a.dot(b)).normalize();
    target = a.multiplyScalar(Math.cos(along)).addScaledVector(direction, Math.sin(along)).normalize();
  }
  return { ...projection, target, targetProgress, length, cursor: { path, segment: projection.segment, progress: projection.progress, normal: data.normal } };
}

export interface BranchNavigation<Route extends string> {
  readonly route: Route | null;
  readonly target: Vector3;
  readonly cursor: RouteCursor | null;
}

/** Geometry chooses clear branches; near the fork vehicle-forward intent can
 * resolve shared-road ambiguity. The incumbent wins weak/noisy evidence.
 * Forward is heading context, never velocity (reverse must not invert bearing). */
export function branchNavigation<Route extends string>(
  normal: Vector3, previous: Route | null, context: NavigationContext,
  paths: Readonly<Record<Route, readonly Vector3[]>>, choices: readonly [Route, Route],
  fork: Vector3, spawn: Vector3, destination: Vector3,
): BranchNavigation<Route> {
  if (context.grounded === false) return { route: previous, target: destination.clone(), cursor: null };
  const [fallback, alternative] = choices;
  const projections = choices.map(route => routeAhead(normal, paths[route]));
  const forkWeight = clamp((2.6 - angle(normal, fork) * PLANET_RADIUS) / 1.8, 0, 1);
  const forward = context.forward && tangent(context.forward, normal);
  const scores = projections.map(p => p.distance + (forward ? forkWeight * 0.85 * (1 - forward.dot(tangent(p.target, normal))) : 0));
  let route = previous;
  const incumbent = previous === alternative ? 1 : 0;
  const other = 1 - incumbent;
  if (scores[other] + 0.55 < scores[incumbent]) route = choices[other];
  else if (route === null && scores[incumbent] + 0.55 < scores[other]) route = choices[incumbent];
  // Recovery/shared approach has no branch commitment. Reset only near spawn,
  // not on a coordinate line cutting across either branch.
  if (angle(normal, spawn) * PLANET_RADIUS < 0.5) route = null;
  const selected = route ?? fallback;
  const ahead = routeAhead(normal, paths[selected], context.cursor ?? null);
  return { route, target: ahead.target, cursor: ahead.cursor };
}
