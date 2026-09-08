import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { PLANET_RADIUS as R } from './math';
import type { TourConnector } from './tour-layout';

/** A tessellated geodesic capsule for each shared path segment, with round joins.
 * No curve fitting: the centreline is exactly the layout's piecewise minor arcs.
 * Subdivision across the width keeps triangle chords above the underlying ground.
 */
export function createTourConnectorGeometry(connector: TourConnector): BufferGeometry {
  const radius = R + 0.085;
  const halfAngle = connector.width / (2 * R);
  const positions: number[] = [], normals: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3) => {
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(a) < 0) [b, c] = [c, b];
    for (const n of [a, b, c]) {
      positions.push(n.x * radius, n.y * radius, n.z * radius);
      normals.push(n.x, n.y, n.z);
    }
  };
  const offset = (normal: Vector3, side: Vector3, angle: number) => normal.clone()
    .multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle)).normalize();
  const columns = Math.ceil(connector.width / 0.18);
  const path = connector.path;
  const segments: { start: Vector3; end: Vector3; side: Vector3 }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const cross = new Vector3().crossVectors(a, b);
    const angle = Math.atan2(cross.length(), a.dot(b));
    if (angle < 1e-10) continue;
    const side = cross.normalize();
    const forward = new Vector3().crossVectors(side, a).normalize();
    const rows = Math.max(1, Math.ceil(angle * R / 0.22));
    const point = (row: number, column: number) => {
      const along = angle * row / rows;
      const n = row === rows ? b : a.clone().multiplyScalar(Math.cos(along)).addScaledVector(forward, Math.sin(along));
      return offset(n, side, halfAngle * (2 * column / columns - 1));
    };
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const p = point(row, column), q = point(row, column + 1);
      const r = point(row + 1, column), s = point(row + 1, column + 1);
      triangle(p, q, r); triangle(q, s, r);
    }
    segments.push({ start: a, end: b, side });
  }

  // Fill only the exposed outside wedges, not overlapping full disks at each
  // sample. End caps and joins match the sampler's distance-to-segment corridor.
  const sector = (center: Vector3, side: Vector3, angle: number) => {
    const rings = Math.ceil(connector.width / 2 / 0.18);
    const slices = Math.max(1, Math.ceil(Math.abs(angle) * connector.width / 2 / 0.12));
    const point = (ring: number, slice: number) => offset(center,
      side.clone().applyAxisAngle(center, angle * slice / slices), halfAngle * ring / rings);
    for (let ring = 0; ring < rings; ring++) for (let slice = 0; slice < slices; slice++) {
      const p = point(ring, slice), q = point(ring + 1, slice);
      const r = point(ring + 1, slice + 1), s = point(ring, slice + 1);
      triangle(p, q, r);
      if (ring > 0) triangle(p, r, s);
    }
  };
  for (let i = 1; i < segments.length; i++) {
    const previous = segments[i - 1], next = segments[i], n = next.start;
    const turn = Math.atan2(n.dot(previous.side.clone().cross(next.side)), previous.side.dot(next.side));
    if (Math.abs(turn) > 1e-8) sector(n, previous.side.clone().multiplyScalar(turn > 0 ? -1 : 1), turn);
  }
  if (segments.length) {
    sector(segments[0].start, segments[0].side, Math.PI);
    sector(segments[segments.length - 1].end, segments[segments.length - 1].side, -Math.PI);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
