import { Vector3 } from 'three';
import { branchNavigation, type BranchNavigation, type NavigationContext } from './route-guidance';
import { PLANET_RADIUS as R } from './math';
import { AuthoredLevel, point, road, type AuthoredLevelDefinition } from './authored-level';
export { inLevelPolygon as inBayPolygon, type LevelPoint as BayPoint } from './authored-level';

const footprintPolygon = [point(-11, -6), point(12, -6), point(12, 9), point(-11, 9)];
// Counterclockwise; the first edge is the open southern mouth, on the footprint boundary.
const waterPolygon = [
  point(-4.6, -6),
  point(4.6, -6),
  point(3.1, -2.9),
  point(2.35, -1.85),
  point(2.3, 0),
  point(2.25, 1.4),
  point(1.5, 2.85),
  point(0.2, 3.3),
  point(-1.2, 2.9),
  point(-2.15, 1.6),
  point(-2.3, 0),
  point(-2.6, -1.5),
  point(-3.4, -3.5),
];
const spawn = point(-8, 0);
const fork = point(-6, 0);
const pad = { center: point(8.9, 0), radius: 1.02 };
const safeCenterline = [
  spawn,
  fork,
  point(-6, 2.8),
  point(-4.5, 4.5),
  point(-1.6, 5.3),
  point(2.3, 5.3),
  point(5.6, 3.9),
  point(7.2, 1),
  pad.center,
];
const ramp = {
  base: point(-4.9, 0),
  lip: point(-2.7, 0),
  length: 2.2,
  width: 1.8,
  rise: 0.65,
  lipPitch: Math.atan(1.3 / 2.2),
};
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

export type BayRoute = 'coast' | 'leap';

export class BayLevel extends AuthoredLevel {
  readonly safeRoute = this.route(safeCenterline);
  readonly jumpRoute = this.route(jumpCenterline);

  navigation(
    normal: Vector3,
    previous: BayRoute | null = null,
    context: NavigationContext = {},
  ): BranchNavigation<BayRoute> {
    return branchNavigation(
      normal,
      previous,
      context,
      { leap: this.jumpRoute, coast: this.safeRoute },
      ['leap', 'coast'],
      this.toNormal(fork.x, fork.y),
      this.spawnPose.normal,
      this.destination.normal,
    );
  }

  constructor(anchor: AuthoredLevelDefinition['anchor'] = BAY_LEVEL.anchor) {
    super({
      ...BAY_LEVEL,
      anchor: { ...anchor },
      destination: {
        id: 'bakery',
        name: 'Sunrise Bakery',
        label: 'SUNRISE BAKERY',
        parcel: 'A bag of warm croissants',
        color: 0xf6b87b,
      },
    });
  }
}
