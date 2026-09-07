import { Vector3 } from 'three';
import { PLANET_RADIUS as R, spherical, type Destination } from './math';
import type { BaySurface, RampCrossing, SurfacePose } from './bay-types';

export interface BayPoint { readonly x: number; readonly y: number }
const point = (x: number, y: number): BayPoint => ({ x, y });
const EPSILON = 1e-7;

function segmentDistance(p: BayPoint, a: BayPoint, b: BayPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function boundaryDistance(p: BayPoint, polygon: readonly BayPoint[]): number {
  return Math.min(...polygon.map((a, i) => segmentDistance(p, a, polygon[(i + 1) % polygon.length])));
}

/** Boundaries belong to the polygon, including the water's visible shoreline. */
export function inBayPolygon(p: BayPoint, polygon: readonly BayPoint[]): boolean {
  if (boundaryDistance(p, polygon) <= EPSILON) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A constant-width, miter-joined road. Both rendering and classification use this outline. */
function roadOutline(centerline: readonly BayPoint[], width: number): BayPoint[] {
  const sides = [-1, 1].map(side => centerline.map((p, i) => {
    const a = centerline[Math.max(0, i - 1)], b = centerline[Math.min(centerline.length - 1, i + 1)];
    const beforeLength = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    const afterLength = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    let nx = -(p.y - a.y) / beforeLength, ny = (p.x - a.x) / beforeLength;
    let mx = -(b.y - p.y) / afterLength, my = (b.x - p.x) / afterLength;
    if (i === 0) { nx = mx; ny = my; }
    if (i === centerline.length - 1) { mx = nx; my = ny; }
    const denominator = 1 + nx * mx + ny * my;
    return point(p.x + side * width * (nx + mx) / (2 * denominator), p.y + side * width * (ny + my) / (2 * denominator));
  }));
  return [...sides[0], ...sides[1].reverse()];
}

function road(centerline: readonly BayPoint[], width: number) {
  return { centerline, width, polygon: roadOutline(centerline, width) };
}

function densify(points: readonly BayPoint[], spacing = 0.22): BayPoint[] {
  const result: BayPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing);
    for (let step = 1; step <= count; step++) result.push(point(a.x + (b.x - a.x) * step / count, a.y + (b.y - a.y) * step / count));
  }
  return result;
}

const footprintPolygon = [point(-11, -6), point(12, -6), point(12, 9), point(-11, 9)];
// Counterclockwise; the first edge is the open southern mouth, on the footprint boundary.
const waterPolygon = [
  point(-4.6, -6), point(4.6, -6), point(3.1, -2.9), point(2.35, -1.85), point(2.3, 0),
  point(2.25, 1.4), point(1.5, 2.85), point(0.2, 3.3), point(-1.2, 2.9),
  point(-2.15, 1.6), point(-2.3, 0), point(-2.6, -1.5), point(-3.4, -3.5),
];
const spawn = point(-8, 0);
const fork = point(-6, 0);
const pad = { center: point(8.9, 0), radius: 1.02 };
const safeCenterline = [spawn, fork, point(-6, 2.8), point(-4.5, 4.5), point(-1.6, 5.3), point(2.3, 5.3), point(5.6, 3.9), point(7.2, 1), pad.center];
const ramp = { base: point(-4.9, 0), lip: point(-2.7, 0), length: 2.2, width: 1.8, rise: 0.65, lipPitch: Math.atan(1.3 / 2.2) };
const landingRegion = { minX: 2.55, maxX: 7.2, minY: -1.65, maxY: 1.65 };
const landingStart = point(landingRegion.minX, 0);
const jumpCenterline = [spawn, fork, ramp.base, ramp.lip, landingStart, point(landingRegion.maxX, 0), pad.center];

/** Local coordinates are geodesic metres: +x east, +y north, anchored at spherical(30, 12).
 * The jump route includes the AIR GAP for navigation, never for drawing or support.
 */
export const BAY_LEVEL = {
  radius: R,
  anchor: { latitude: 30, longitude: 12 },
  footprintPolygon,
  waterPolygon,
  // A notch, not a touching polygon hole: derived from the exact water boundary.
  landPolygon: [footprintPolygon[0], waterPolygon[0], ...waterPolygon.slice(1).reverse(), ...footprintPolygon.slice(1)],
  surfaceRadii: { ground: R + 0.075, road: R + 0.085, water: R + 0.025 },
  spawn: { position: spawn, heading: point(1, 0) },
  recovery: { position: spawn, heading: point(1, 0) },
  fork,
  safeRouteCenterline: safeCenterline,
  jumpRouteCenterline: jumpCenterline,
  // Deliberately disjoint: there is no road underneath the jump or across the water.
  roads: {
    safe: road(safeCenterline, 1.8),
    approach: road([point(-8.7, 0), fork, ramp.base], 1.8),
    landing: road([landingStart, pad.center], 1.8),
  },
  ramp,
  landingRegion,
  pad,
  bakery: { center: point(8.9, 2.3), facing: pad.center, colliderRadius: 1.02 },
  sceneryClearance: 1.15,
  overlayMaxEdge: 0.5,
  reactionDuration: 2.65,
} as const;

export class BayLevel {
  private readonly anchor = spherical(BAY_LEVEL.anchor.latitude, BAY_LEVEL.anchor.longitude);
  private readonly east = new Vector3(Math.cos(BAY_LEVEL.anchor.longitude * Math.PI / 180), 0, -Math.sin(BAY_LEVEL.anchor.longitude * Math.PI / 180));
  private readonly north = new Vector3().crossVectors(this.anchor, this.east).normalize();
  readonly spawnPose: SurfacePose = this.pose(BAY_LEVEL.spawn.position, BAY_LEVEL.spawn.heading);
  readonly recoveryPose: SurfacePose = this.pose(BAY_LEVEL.recovery.position, BAY_LEVEL.recovery.heading);
  readonly destination: Destination = {
    id: 'bakery', name: 'Sunrise Bakery', label: 'SUNRISE BAKERY', parcel: 'A bag of warm croissants',
    normal: this.toNormal(pad.center.x, pad.center.y), color: 0xf6b87b,
  };
  readonly safeRoute: Vector3[] = densify(safeCenterline).map(p => this.toNormal(p.x, p.y));
  readonly jumpRoute: Vector3[] = densify(jumpCenterline).map(p => this.toNormal(p.x, p.y));

  /** Exponential map: distance from the anchor is hypot(x,y), not a flat-plane projection. */
  toNormal(x: number, y: number): Vector3 {
    const distance = Math.hypot(x, y);
    if (distance < 1e-12) return this.anchor.clone();
    const scale = Math.sin(distance / R) / distance;
    return this.anchor.clone().multiplyScalar(Math.cos(distance / R)).addScaledVector(this.east, x * scale).addScaledVector(this.north, y * scale).normalize();
  }

  toLocal(normal: Vector3): { x: number; y: number } {
    const n = normal.clone().normalize();
    const east = n.dot(this.east), north = n.dot(this.north);
    const length = Math.hypot(east, north);
    if (length < 1e-12) return { x: n.dot(this.anchor) < 0 ? Math.PI * R : 0, y: 0 };
    const scale = R * Math.atan2(length, n.dot(this.anchor)) / length;
    return { x: east * scale, y: north * scale };
  }

  private pose(p: BayPoint, heading: BayPoint): SurfacePose {
    const normal = this.toNormal(p.x, p.y);
    const forward = this.toNormal(p.x + heading.x * 0.001, p.y + heading.y * 0.001)
      .sub(this.toNormal(p.x - heading.x * 0.001, p.y - heading.y * 0.001));
    forward.addScaledVector(normal, -forward.dot(normal)).normalize();
    return { normal, forward };
  }

  isInFootprint(n: Vector3): boolean { return inBayPolygon(this.toLocal(n), footprintPolygon); }

  /** Includes overhangs of legacy scenery/roads just outside the authored patch. */
  isInSceneryClearance(n: Vector3, margin: number = BAY_LEVEL.sceneryClearance): boolean {
    const p = this.toLocal(n);
    return inBayPolygon(p, footprintPolygon) || boundaryDistance(p, footprintPolygon) < margin;
  }

  distanceToShore(x: number, y: number): number { return boundaryDistance({ x, y }, waterPolygon); }

  rampRadiusAt(x: number): number {
    const t = Math.max(0, Math.min(1, (x - ramp.base.x) / ramp.length));
    return BAY_LEVEL.surfaceRadii.road + ramp.rise * t * t;
  }

  sampleSurface(n: Vector3): BaySurface {
    const p = this.toLocal(n);
    if (p.x >= ramp.base.x - EPSILON && p.x <= ramp.lip.x + EPSILON && Math.abs(p.y - ramp.base.y) <= ramp.width / 2 + EPSILON) {
      const rampProgress = Math.max(0, Math.min(1, (p.x - ramp.base.x) / ramp.length));
      return {
        kind: 'ramp', radius: this.rampRadiusAt(p.x), rampProgress,
        rampSlope: 2 * ramp.rise * rampProgress / ramp.length,
        rampForward: this.pose(p, point(1, 0)).forward,
      };
    }
    if (inBayPolygon(p, waterPolygon)) return { kind: 'water', radius: BAY_LEVEL.surfaceRadii.water };
    if (Object.values(BAY_LEVEL.roads).some(road => inBayPolygon(p, road.polygon)) || Math.hypot(p.x - pad.center.x, p.y - pad.center.y) <= pad.radius + EPSILON) {
      return { kind: 'road', radius: BAY_LEVEL.surfaceRadii.road };
    }
    return { kind: 'ground', radius: BAY_LEVEL.surfaceRadii.ground };
  }

  crossRampLip(previous: Vector3, next: Vector3): RampCrossing | null {
    const a = this.toLocal(previous), b = this.toLocal(next);
    const dx = b.x - a.x;
    // You must arrive from ON the ramp, not from its back or side, or in reverse.
    if (dx <= EPSILON || a.x < ramp.base.x - EPSILON || a.x >= ramp.lip.x - EPSILON || b.x < ramp.lip.x - EPSILON || Math.abs(a.y) > ramp.width / 2 + EPSILON) return null;
    const fraction = Math.max(0, Math.min(1, (ramp.lip.x - a.x) / dx));
    const y = a.y + (b.y - a.y) * fraction;
    if (Math.abs(y) > ramp.width / 2 + EPSILON) return null;
    const pose = this.pose(point(ramp.lip.x, y), point(1, 0));
    return { ...pose, radius: this.rampRadiusAt(ramp.lip.x), pitch: ramp.lipPitch, fraction };
  }
}
