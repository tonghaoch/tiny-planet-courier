import * as THREE from 'three';
import type { AuthoredLevel } from '../authored-level';
import type { BayPoint } from '../bay-level';
import { GardenLevel } from '../garden-level';
import { StationLevel } from '../station-level';
import { BayLevel } from '../bay-level';
import { BeaconLevel, DepotLevel } from '../tour-outposts';
import type { TourStopId } from '../tour-layout';
import { PALETTE, material, mesh } from './scenery-primitives';

/** Triangulate in authored coordinates, then split every long chord before projection.
 * Even the low water overlay stays outside the original radius between vertices.
 */
export function localeOverlay(
  root: THREE.Object3D,
  level: AuthoredLevel,
  name: string,
  polygons: readonly (readonly BayPoint[])[],
  radiusAt: (p: BayPoint) => number,
  mat: THREE.MeshStandardMaterial,
  colorAt?: (p: BayPoint) => THREE.Color,
) {
  const positions: number[] = [],
    colors: number[] = [];
  const lengthSq = (a: BayPoint, b: BayPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const append = (a: BayPoint, b: BayPoint, c: BayPoint) => {
    const edges = [lengthSq(a, b), lengthSq(b, c), lengthSq(c, a)];
    const longest = Math.max(...edges);
    if (longest > level.definition.overlayMaxEdge ** 2) {
      // Longest-edge bisection avoids exploding an entire large triangle into a grid.
      const edge = edges.indexOf(longest);
      const [p, q, other] = edge === 0 ? [a, b, c] : edge === 1 ? [b, c, a] : [c, a, b];
      const midpoint = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      append(p, midpoint, other);
      append(midpoint, q, other);
      return;
    }
    for (const p of [a, b, c]) {
      positions.push(...level.toNormal(p.x, p.y).multiplyScalar(radiusAt(p)).toArray());
      if (colorAt) colors.push(...colorAt(p).toArray());
    }
  };
  for (const polygon of polygons) {
    const contour = polygon.map(p => new THREE.Vector2(p.x, p.y));
    for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const [a, b, c] = triangle.map(i => polygon[i]);
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) append(a, c, b);
      else append(a, b, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colorAt) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const overlay = mesh(geometry, mat, root, 0, 0, 0, false);
  overlay.name = name;
  overlay.userData.keepSurfaceGeometry = /-(land|water|road)$/.test(name);
  overlay.receiveShadow = true;
  return overlay;
}

export function localeFrame(
  level: AuthoredLevel,
  p: BayPoint,
  facing: BayPoint,
  radius = level.definition.surfaceRadii.ground,
) {
  const normal = level.toNormal(p.x, p.y);
  const forward = level.toNormal(facing.x, facing.y);
  forward.addScaledVector(normal, -forward.dot(normal)).normalize();
  const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
  const group = new THREE.Group();
  group.position.copy(normal).multiplyScalar(radius);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, forward));
  return group;
}

export function localePrefix(level: AuthoredLevel): TourStopId {
  if (level instanceof BayLevel) return 'bay';
  if (level instanceof StationLevel) return 'station';
  if (level instanceof GardenLevel) return 'garden';
  if (level instanceof BeaconLevel) return 'beacon';
  if (level instanceof DepotLevel) return 'depot';
  throw new Error('Unknown authored locale');
}

export function localeArrow(
  root: THREE.Object3D,
  level: AuthoredLevel,
  p: BayPoint,
  direction: BayPoint,
  scale = 1,
  color = PALETTE.orange,
) {
  const d = Math.hypot(direction.x, direction.y);
  const x = direction.x / d,
    y = direction.y / d;
  const shape = [
    [-0.4, -0.12],
    [0.08, -0.12],
    [0.08, -0.28],
    [0.46, 0],
    [0.08, 0.28],
    [0.08, 0.12],
    [-0.4, 0.12],
  ];
  const polygon = shape.map(([a, b]) => ({ x: p.x + (x * a - y * b) * scale, y: p.y + (y * a + x * b) * scale }));
  localeOverlay(
    root,
    level,
    `${localePrefix(level)}-route-arrow`,
    [polygon],
    q => level.sampleSurface(level.toNormal(q.x, q.y)).radius + 0.012,
    material(color),
  );
}

/** Canvas is optional: arrows, colors and physical signboards still exist in Node. */
export function localePlaque(
  level: AuthoredLevel,
  parent: THREE.Object3D,
  label: string,
  width: number,
  height: number,
  y: number,
  z: number,
  ink = '#655747',
) {
  mesh(new THREE.BoxGeometry(width + 0.09, height + 0.06, 0.06), material(PALETTE.cream), parent, 0, y, z);
  if (typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffebcb';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = ink;
    context.font = 'bold 69px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 30);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const text = mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture }),
      parent,
      0,
      y,
      z + 0.032,
      false,
    );
    text.name = `${localePrefix(level)}-label-${label.toLowerCase().replaceAll(' ', '-')}`;
  } catch {
    /* Browsers with disabled canvas can still play; Node never enters here. */
  }
}
