import { Vector3 } from 'three';
import { spherical, type Destination } from './math';
import type { BaySurface, RampCrossing, SurfacePose } from './bay-types';

export interface LevelPoint { readonly x: number; readonly y: number }
export const point = (x: number, y: number): LevelPoint => ({ x, y });
const EPSILON = 1e-7;

export interface AuthoredLevelDefinition {
  readonly radius: number;
  readonly anchor: { readonly latitude: number; readonly longitude: number };
  readonly footprintPolygon: readonly LevelPoint[];
  readonly landPolygon: readonly LevelPoint[];
  readonly waterPolygon: readonly LevelPoint[];
  readonly surfaceRadii: { readonly ground: number; readonly road: number; readonly water: number };
  readonly spawn: { readonly position: LevelPoint; readonly heading: LevelPoint };
  readonly recovery: { readonly position: LevelPoint; readonly heading: LevelPoint };
  readonly roads: Readonly<Record<string, ReturnType<typeof road>>>;
  readonly pad: { readonly center: LevelPoint; readonly radius: number };
  readonly ramp?: {
    readonly base: LevelPoint; readonly lip: LevelPoint;
    readonly length: number; readonly width: number; readonly rise: number; readonly lipPitch: number;
  };
  readonly sceneryClearance: number;
  readonly overlayMaxEdge: number;
  readonly destination: Omit<Destination, 'normal'>;
}

export function segmentDistance(p: LevelPoint, a: LevelPoint, b: LevelPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function boundaryDistance(p: LevelPoint, polygon: readonly LevelPoint[]): number {
  return Math.min(...polygon.map((a, i) => segmentDistance(p, a, polygon[(i + 1) % polygon.length])));
}

/** Boundaries belong to the polygon, including the water's visible shoreline. */
export function inLevelPolygon(p: LevelPoint, polygon: readonly LevelPoint[]): boolean {
  if (polygon.length < 3) return false;
  if (boundaryDistance(p, polygon) <= EPSILON) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A constant-width, miter-joined road shared by rendering and classification. */
export function road(centerline: readonly LevelPoint[], width: number) {
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
  return { centerline, width, polygon: [...sides[0], ...sides[1].reverse()] };
}

export function densify(points: readonly LevelPoint[], spacing = 0.22): LevelPoint[] {
  if (!points.length) return [];
  const result: LevelPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing);
    for (let step = 1; step <= count; step++) result.push(point(a.x + (b.x - a.x) * step / count, a.y + (b.y - a.y) * step / count));
  }
  return result;
}

export class AuthoredLevel {
  private readonly anchor: Vector3;
  private readonly east: Vector3;
  private readonly north: Vector3;
  readonly spawnPose: SurfacePose;
  readonly recoveryPose: SurfacePose;
  readonly destination: Destination;

  constructor(readonly definition: AuthoredLevelDefinition) {
    const { anchor, spawn, recovery, pad, destination } = definition;
    this.anchor = spherical(anchor.latitude, anchor.longitude);
    this.east = new Vector3(Math.cos(anchor.longitude * Math.PI / 180), 0, -Math.sin(anchor.longitude * Math.PI / 180));
    this.north = new Vector3().crossVectors(this.anchor, this.east).normalize();
    this.spawnPose = this.pose(spawn.position, spawn.heading);
    this.recoveryPose = this.pose(recovery.position, recovery.heading);
    this.destination = { ...destination, normal: this.toNormal(pad.center.x, pad.center.y) };
  }

  /** Exponential map: distance from the anchor is hypot(x,y), not a flat-plane projection. */
  toNormal(x: number, y: number): Vector3 {
    const distance = Math.hypot(x, y), radius = this.definition.radius;
    if (distance < 1e-12) return this.anchor.clone();
    const scale = Math.sin(distance / radius) / distance;
    return this.anchor.clone().multiplyScalar(Math.cos(distance / radius)).addScaledVector(this.east, x * scale).addScaledVector(this.north, y * scale).normalize();
  }

  toLocal(normal: Vector3): LevelPoint {
    const n = normal.clone().normalize();
    const east = n.dot(this.east), north = n.dot(this.north);
    const length = Math.hypot(east, north), radius = this.definition.radius;
    if (length < 1e-12) return { x: n.dot(this.anchor) < 0 ? Math.PI * radius : 0, y: 0 };
    const scale = radius * Math.atan2(length, n.dot(this.anchor)) / length;
    return { x: east * scale, y: north * scale };
  }

  private pose(p: LevelPoint, heading: LevelPoint): SurfacePose {
    const normal = this.toNormal(p.x, p.y);
    const forward = this.toNormal(p.x + heading.x * 0.001, p.y + heading.y * 0.001)
      .sub(this.toNormal(p.x - heading.x * 0.001, p.y - heading.y * 0.001));
    forward.addScaledVector(normal, -forward.dot(normal)).normalize();
    return { normal, forward };
  }

  route(points: readonly LevelPoint[]): Vector3[] {
    return densify(points).map(p => this.toNormal(p.x, p.y));
  }

  isInFootprint(n: Vector3): boolean { return inLevelPolygon(this.toLocal(n), this.definition.footprintPolygon); }

  /** Includes overhangs of legacy scenery/roads just outside the authored patch. */
  isInSceneryClearance(n: Vector3, margin = this.definition.sceneryClearance): boolean {
    const p = this.toLocal(n), polygon = this.definition.footprintPolygon;
    return inLevelPolygon(p, polygon) || boundaryDistance(p, polygon) < margin;
  }

  distanceToShore(x: number, y: number): number { return boundaryDistance({ x, y }, this.definition.waterPolygon); }

  rampRadiusAt(x: number): number {
    const { ramp, surfaceRadii } = this.definition;
    if (!ramp) return surfaceRadii.road;
    const t = Math.max(0, Math.min(1, (x - ramp.base.x) / ramp.length));
    return surfaceRadii.road + ramp.rise * t * t;
  }

  sampleSurface(n: Vector3): BaySurface {
    const p = this.toLocal(n);
    const { ramp, waterPolygon, surfaceRadii, roads, pad } = this.definition;
    if (ramp && p.x >= ramp.base.x - EPSILON && p.x <= ramp.lip.x + EPSILON && Math.abs(p.y - ramp.base.y) <= ramp.width / 2 + EPSILON) {
      const rampProgress = Math.max(0, Math.min(1, (p.x - ramp.base.x) / ramp.length));
      return {
        kind: 'ramp', radius: this.rampRadiusAt(p.x), rampProgress,
        rampSlope: 2 * ramp.rise * rampProgress / ramp.length,
        rampForward: this.pose(p, point(1, 0)).forward,
      };
    }
    if (inLevelPolygon(p, waterPolygon)) return { kind: 'water', radius: surfaceRadii.water };
    if (Object.values(roads).some(road => inLevelPolygon(p, road.polygon)) || Math.hypot(p.x - pad.center.x, p.y - pad.center.y) <= pad.radius + EPSILON) {
      return { kind: 'road', radius: surfaceRadii.road };
    }
    return { kind: 'ground', radius: surfaceRadii.ground };
  }

  crossRampLip(previous: Vector3, next: Vector3): RampCrossing | null {
    const ramp = this.definition.ramp;
    if (!ramp) return null;
    const a = this.toLocal(previous), b = this.toLocal(next);
    const dx = b.x - a.x;
    // Arrive from ON the eastward ramp, not its back or side, or in reverse.
    if (dx <= EPSILON || a.x < ramp.base.x - EPSILON || a.x >= ramp.lip.x - EPSILON || b.x < ramp.lip.x - EPSILON || Math.abs(a.y - ramp.base.y) > ramp.width / 2 + EPSILON) return null;
    const fraction = Math.max(0, Math.min(1, (ramp.lip.x - a.x) / dx));
    const y = a.y + (b.y - a.y) * fraction;
    if (Math.abs(y - ramp.base.y) > ramp.width / 2 + EPSILON) return null;
    const pose = this.pose(point(ramp.lip.x, y), point(1, 0));
    return { ...pose, radius: this.rampRadiusAt(ramp.lip.x), pitch: ramp.lipPitch, fraction };
  }
}
