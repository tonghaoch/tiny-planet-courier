import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_RADIUS as R, UP, seededRandom, spherical, surfaceDistance, type Collider, type Destination } from './math';
import { BAY_LEVEL, BayLevel, inBayPolygon, type BayPoint } from './bay-level';
import type { AuthoredLevel } from './authored-level';
import { STATION_LEVEL, StationLevel } from './station-level';
import { StationDeliveryReaction } from './station-reaction';
import { GARDEN_LEVEL, GardenLevel } from './garden-level';
import { GardenDeliveryReaction } from './garden-reaction';
import type { BayEnvironment, SurfacePose } from './bay-types';
import { TourLayout } from './tour-layout';
import { createTourConnectorGeometry } from './tour-world-geometry';

const PALETTE = { ocean: 0x387f8b, shallow: 0x70baa9, sand: 0xe4cf9f, grass: 0x88b99b, leaf: 0x568a76, darkLeaf: 0x326f62, road: 0xe8d9b8, orange: 0xf49869, cream: 0xffebcb };
const materials = new Map<string, THREE.MeshStandardMaterial>();
const material = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => {
  const key = JSON.stringify([color, extra]);
  let result = materials.get(key);
  if (!result) {
    result = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...extra });
    materials.set(key, result);
  }
  return result;
};
const align = (normal: THREE.Vector3, altitude = R) => {
  const group = new THREE.Group();
  group.position.copy(normal).multiplyScalar(altitude);
  group.quaternion.setFromUnitVectors(UP, normal);
  return group;
};

function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(x, y, z);
  result.castShadow = shadow;
  result.receiveShadow = shadow;
  parent.add(result);
  return result;
}

const ROUTES = [
  [spherical(30, -180), spherical(30, -120), spherical(30, -60), spherical(30, 0), spherical(30, 60), spherical(30, 120), spherical(30, 180)],
  [spherical(-70, 85), spherical(-35, 85), spherical(0, 85), spherical(35, 85), spherical(70, 85), spherical(85, 180), spherical(60, -95), spherical(20, -95), spherical(-30, -95), spherical(-70, -95), spherical(-85, 0), spherical(-70, 85)],
  [spherical(30, 0), spherical(45, -15), spherical(48, -35), spherical(48, -50), spherical(30, -65)],
];

function interpolateRoad(nodes: THREE.Vector3[], count: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(nodes.map(n => n.clone().multiplyScalar(R)));
  return curve.getPoints(count).map(p => p.normalize());
}

interface BakeryReaction {
  root: THREE.Group;
  hinge: THREE.Group;
  recipient: THREE.Group;
  arm: THREE.Group;
  parcel: THREE.Group;
  windowMaterial: THREE.MeshStandardMaterial;
  parcelStartWorld: THREE.Vector3;
  elapsed: number;
  started: boolean;
}

export interface DeliveryReactionSnapshot {
  destination?: string;
  active: boolean;
  progress: number;
  recipientVisible: boolean;
  parcelVisible: boolean;
  doorOpen?: number;
  windowGlow?: number;
  telescopeTurn?: number;
  bloom?: number;
  flowersBloomed?: boolean;
}

export class PlanetWorld {
  readonly root = new THREE.Group();
  readonly colliders: Collider[] = [];
  readonly bayLevel: BayLevel | null;
  readonly stationLevel: StationLevel | null;
  readonly gardenLevel: GardenLevel | null;
  readonly tourLayout: TourLayout | null;
  /** A single-locale alias only; Tour has no privileged district. */
  readonly authoredLevel: AuthoredLevel | null;
  readonly drivingEnvironment: BayEnvironment | null;
  readonly bayEnvironment: BayEnvironment | null;
  readonly destinations: Destination[] = [
    { id: 'bakery', name: 'Sunrise Bakery', label: 'SUNRISE BAKERY', parcel: 'A bag of warm croissants', normal: spherical(30, 28), color: 0xf6b87b },
    { id: 'observatory', name: 'Stargaze Station', label: 'STARGAZE STATION', parcel: 'A letter from Earth', normal: spherical(-10, 85), color: 0xc6b6ea },
    { id: 'windmill', name: 'Windmill Garden', label: 'WINDMILL GARDEN', parcel: 'Flower seeds for the gardener', normal: spherical(48, -50), color: 0x9bd6b3 },
  ];
  private readonly random = seededRandom(417);
  private readonly roads = ROUTES.map(route => interpolateRoad(route, 180));
  private readonly targetGroups: THREE.Group[] = [];
  private readonly icons: THREE.Group[] = [];
  private readonly clouds = new THREE.Group();
  private readonly turbines: THREE.Group[] = [];
  private readonly particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private activeIndex = -1;
  private readonly parcelGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  private readonly particleGeometry = new THREE.BoxGeometry(0.10, 0.10, 0.10);
  private readonly particleMaterials = [material(0xf6ba78), material(0xffffff), material(0xa4e1b4)];
  private readonly splashMaterials = [material(0x81d8e0), material(0x459eb9), material(0xd8f4e8)];
  private readonly splashParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private bakeryReaction: BakeryReaction | null = null;
  private stationReaction: StationDeliveryReaction | null = null;
  private gardenReaction: GardenDeliveryReaction | null = null;

  constructor(prototype: boolean | 'bay' | 'station' | 'garden' | 'tour' = false, private readonly reducedMotion = false) {
    this.tourLayout = prototype === 'tour' ? new TourLayout() : null;
    this.bayLevel = this.tourLayout?.stops[0].level ?? (prototype === true || prototype === 'bay' ? new BayLevel() : null);
    this.stationLevel = this.tourLayout?.stops[1].level ?? (prototype === 'station' ? new StationLevel() : null);
    this.gardenLevel = this.tourLayout?.stops[2].level ?? (prototype === 'garden' ? new GardenLevel() : null);
    this.authoredLevel = this.tourLayout ? null : this.bayLevel ?? this.stationLevel ?? this.gardenLevel;
    const level = this.authoredLevel;
    this.drivingEnvironment = this.tourLayout ? this.tourLayout.createEnvironment(this.colliders) : level ? {
      spawnPose: level.spawnPose,
      recoveryPose: level.recoveryPose,
      colliders: this.colliders,
      sampleSurface: normal => level.sampleSurface(normal),
      crossRampLip: (previous, next) => level.crossRampLip(previous, next),
    } : null;
    this.bayEnvironment = this.drivingEnvironment;
    if (this.tourLayout) this.destinations = this.tourLayout.destinations;
    else if (level) this.destinations = [level.destination];
    this.buildPlanet();
    this.buildRoads();
    this.buildTourConnectors();
    this.buildSettlements();
    if (this.bayLevel) this.buildBayLocale();
    if (this.stationLevel) this.buildStationLocale();
    if (this.gardenLevel) this.buildGardenLocale();
    this.buildNature();
    this.buildClouds();
    this.buildTargets();
    this.buildAtmosphere();
    // Modest omnidirectional fill complements the existing sun/hemisphere rig on
    // the far side of the planet. No shared material or standalone lighting changes.
    if (this.tourLayout) this.root.add(new THREE.AmbientLight(0xe0f0ef, 0.6));
    this.batchStaticScenery();
    this.setActiveDestination(-1);
  }

  private batchStaticScenery() {
    const animated = new Set<THREE.Object3D>([this.clouds, ...this.turbines, ...this.targetGroups]);
    // Register the ancestor BEFORE collecting batches: doors, limbs, parcel and windows
    // must keep their transforms/material ownership through every replay.
    if (this.bakeryReaction) animated.add(this.bakeryReaction.root);
    if (this.stationReaction) animated.add(this.stationReaction.root);
    if (this.gardenReaction) {
      animated.add(this.gardenReaction.root);
      animated.add(this.gardenReaction.flowers);
    }
    const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
    this.root.updateMatrixWorld(true);
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (animated.has(parent)) return;
      }
      if (object.userData.keepSurfaceGeometry) return;
      // Projected overlays have position/normal (and sometimes color), while
      // primitive meshes also have UVs. Never ask Three to merge unlike schemas.
      const attributes = Object.keys(object.geometry.attributes).sort().map(name => {
        const attribute = object.geometry.getAttribute(name);
        return `${name}/${attribute.itemSize}/${attribute.normalized}`;
      }).join(',');
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${attributes}`;
      const batch = batches.get(key) ?? [];
      batch.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>);
      batches.set(key, batch);
    });
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(object => {
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        return geometry.applyMatrix4(object.matrixWorld);
      });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(geometry => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const batch = new THREE.Mesh(merged, meshes[0].material);
      batch.castShadow = meshes[0].castShadow;
      batch.receiveShadow = meshes[0].receiveShadow;
      meshes.forEach(object => object.removeFromParent());
      this.root.add(batch);
    }
  }

  heightAt(normal: THREE.Vector3): number { return this.drivingEnvironment?.sampleSurface(normal).radius ?? R + 0.105; }

  /** The session owns checkpoint policy; the world only takes a defensive copy. */
  setTourRecoveryPose(pose: SurfacePose): void {
    if (!this.tourLayout || !this.drivingEnvironment) return;
    this.drivingEnvironment.recoveryPose = { normal: pose.normal.clone(), forward: pose.forward.clone() };
  }

  private destinationLevel(index: number): AuthoredLevel | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.destinations.length) return null;
    return this.tourLayout?.stops[index]?.level ?? this.authoredLevel;
  }

  private sceneryClearance(normal: THREE.Vector3, margin?: number): boolean {
    return this.tourLayout?.isInSceneryClearance(normal, margin)
      ?? this.authoredLevel?.isInSceneryClearance(normal, margin) ?? false;
  }

  private buildTourConnectors() {
    for (const connector of this.tourLayout?.connectors ?? []) {
      const road = mesh(createTourConnectorGeometry(connector), material(PALETTE.road), this.root, 0, 0, 0, false);
      road.name = `tour-connector-${connector.from}-${connector.to}`;
      road.userData.keepSurfaceGeometry = true;
      road.receiveShadow = true;
    }
  }

  private terrain(n: THREE.Vector3): number {
    return Math.sin(n.x * 4.8 + n.z * 2.7) * 0.44 + Math.cos(n.y * 5.2 - n.x * 2) * 0.38 + Math.sin(n.z * 8 + n.y * 3) * 0.17;
  }

  private buildPlanet() {
    const geometry = new THREE.IcosahedronGeometry(R, 5);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const center = new THREE.Vector3();
    const a = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      center.set(0, 0, 0);
      for (let j = 0; j < 3; j++) center.add(a.fromBufferAttribute(positions, i + j));
      center.normalize();
      const height = this.terrain(center);
      if (height < -0.26) color.setHex(PALETTE.ocean);
      else if (height < -0.15) color.setHex(PALETTE.shallow);
      else if (height < -0.07) color.setHex(PALETTE.sand);
      else color.setHex(PALETTE.grass);
      color.multiplyScalar(0.95 + this.random() * 0.1);
      for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const planet = mesh(geometry, material(0xffffff, { vertexColors: true }), this.root, 0, 0, 0, false);
    planet.name = 'base-planet';
    planet.receiveShadow = true;
  }

  private buildRoads() {
    const roadMat = material(PALETTE.road);
    const stripeMat = material(0xfff3d7);
    for (const normals of this.roads) {
      const vertices: number[] = [];
      const indices: number[] = [];
      normals.forEach((n, i) => {
        const forward = normals[Math.min(i + 1, normals.length - 1)].clone().sub(normals[Math.max(0, i - 1)]);
        const right = new THREE.Vector3().crossVectors(forward, n).normalize();
        const leftPoint = n.clone().multiplyScalar(R + 0.075).addScaledVector(right, -0.52).normalize().multiplyScalar(R + 0.085);
        const rightPoint = n.clone().multiplyScalar(R + 0.075).addScaledVector(right, 0.52).normalize().multiplyScalar(R + 0.085);
        vertices.push(...leftPoint.toArray(), ...rightPoint.toArray());
        const next = normals[Math.min(i + 1, normals.length - 1)];
        // The margin covers the whole old road plus its between-sample chord,
        // rather than testing only its centre against the authored boundary.
        const clipped = [n, next, n.clone().add(next).normalize()].some(p => this.sceneryClearance(p));
        if (i < normals.length - 1 && !clipped) {
          const k = i * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
        if (i % 3 === 0 && !clipped) {
          const stripe = align(n, R + 0.103);
          const dash = mesh(new THREE.BoxGeometry(0.045, 0.008, 0.2), stripeMat, stripe, 0, 0, 0, false);
          const localForward = forward.normalize().applyQuaternion(stripe.quaternion.clone().invert());
          dash.rotation.y = Math.atan2(localForward.x, localForward.z);
          this.root.add(stripe);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const road = mesh(geo, roadMat, this.root, 0, 0, 0, false);
      road.material = roadMat;
      road.receiveShadow = true;
    }
  }

  private nearRoad(n: THREE.Vector3, width = 1.3): boolean {
    return this.roads.some(road => road.some(p => surfaceDistance(n, p) < width));
  }

  private house(n: THREE.Vector3, color: number, scale = 1, style = 0) {
    if (this.sceneryClearance(n, Math.max(this.authoredLevel?.definition.sceneryClearance ?? 1.5, scale))) return;
    const group = align(n);
    group.rotateY(this.random() * Math.PI * 2);
    const wall = material(color);
    const roofMat = material([0xbf755f, 0x526c70, 0xa87665, 0xa4ac8a][style % 4]);
    const wood = material(0x6b6155);
    const windowMat = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.20 });
    const trim = material(PALETTE.cream);
    mesh(new THREE.BoxGeometry(0.95, 0.92, 0.82), wall, group, 0, 0.53, 0);
    mesh(new THREE.BoxGeometry(1.07, 0.12, 0.94), trim, group, 0, 0.11, 0);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.59, 0); roofShape.lineTo(0.59, 0); roofShape.lineTo(0, 0.57); roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.02, bevelEnabled: false });
    mesh(roofGeo, roofMat, group, 0, 0.97, -0.51);
    mesh(new THREE.BoxGeometry(0.22, 0.49, 0.06), wood, group, 0, 0.38, 0.43);
    for (const x of [-0.29, 0.29]) {
      mesh(new THREE.BoxGeometry(0.23, 0.27, 0.06), trim, group, x, 0.66, 0.44);
      mesh(new THREE.BoxGeometry(0.16, 0.2, 0.07), windowMat, group, x, 0.66, 0.46, false);
    }
    mesh(new THREE.BoxGeometry(0.2, 0.49, 0.22), trim, group, 0.28, 1.35, -0.17);
    if (style === 0) {
      const awning = mesh(new THREE.BoxGeometry(1.08, 0.09, 0.40), material(0xe99777), group, 0, 0.85, 0.59);
      awning.rotation.x = 0.12;
      for (let i = -2; i <= 2; i++) mesh(new THREE.BoxGeometry(0.1, 0.10, 0.41), trim, group, i * 0.20, 0.85, 0.59, false);
    }
    group.scale.setScalar(scale);
    this.root.add(group);
    this.colliders.push({ normal: n, radius: 0.62 * scale });
  }

  private buildSettlements() {
    if (!this.tourLayout) this.house(spherical(35, 28), 0xf1c695, 1.45, 0);
    this.house(spherical(24, 34), 0xe7b3a7, 1.0, 1);
    this.house(spherical(37, 17), 0xc6c5a3, 0.85, 2);
    this.house(spherical(22, 12), 0xe7d5b5, 1.15, 3);
    this.house(spherical(23, -15), 0x98b7b3, 0.95, 1);
    this.house(spherical(38, -33), 0xe4b599, 1.1, 0);
    this.house(spherical(-14, 91), 0xd8c4cd, 1.4, 1);
    this.house(spherical(37, 118), 0xe7c6ac, 1.25, 2);
    this.house(spherical(-3, -104), 0xdcc2a8, 1.15, 0);
    this.house(spherical(37, -135), 0xafb9ba, 1.4, 3);
    this.house(spherical(-43, 95), 0xe5b8ac, 0.95, 2);
    this.house(spherical(53, -62), 0xe7d1a8, 1.0, 0);

    if (!this.tourLayout && !this.sceneryClearance(spherical(54, -47), 1.7)) {
      const windmill = align(spherical(54, -47));
      windmill.name = 'legacy-windmill';
      mesh(new THREE.CylinderGeometry(0.31, 0.49, 1.9, 8), material(0xeedbbe), windmill, 0, 0.95);
      mesh(new THREE.ConeGeometry(0.54, 0.60, 8), material(0xbb866c), windmill, 0, 2.15);
      const rotor = new THREE.Group();
      rotor.position.set(0, 1.75, 0.43);
      const wingMat = material(0xffecc8);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Group();
        blade.rotation.z = i * Math.PI / 2;
        mesh(new THREE.BoxGeometry(0.11, 1.2, 0.07), material(0x7e6954), blade, 0, 0.64, 0);
        mesh(new THREE.BoxGeometry(0.27, 0.83, 0.06), wingMat, blade, 0.08, 0.80, 0.045);
        rotor.add(blade);
      }
      mesh(new THREE.SphereGeometry(0.15, 8, 6), material(0xe7b98c), rotor, 0, 0, 0.08);
      windmill.add(rotor);
      this.turbines.push(rotor);
      this.root.add(windmill);
      this.colliders.push({ normal: spherical(54, -47), radius: 0.6 });
    }

    if (!this.tourLayout && !this.sceneryClearance(spherical(-4, 92))) {
      const observatory = align(spherical(-4, 92));
      observatory.name = 'legacy-observatory';
      mesh(new THREE.CylinderGeometry(0.69, 0.75, 0.86, 16), material(0xeee1cd), observatory, 0, 0.46);
      mesh(new THREE.SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), material(0x8d9bad, { metalness: 0.22 }), observatory, 0, 0.88);
      const telescope = mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.89, 10), material(0x546a7a), observatory, 0.1, 1.34, 0.43);
      telescope.rotation.x = 0.9;
      this.root.add(observatory);
      this.colliders.push({ normal: spherical(-4, 92), radius: 0.75 });
    }

    if (!this.sceneryClearance(spherical(-13, -30))) {
      const lighthouse = align(spherical(-13, -30));
      for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.3 - i * 0.02, 0.32 - i * 0.02, 0.36, 10), material(i % 2 ? 0xdf977d : 0xf8e6c6), lighthouse, 0, 0.18 + i * 0.36);
      mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.35, 10), material(0xffd58b, { emissive: 0xffc36d, emissiveIntensity: 0.6 }), lighthouse, 0, 1.98);
      mesh(new THREE.ConeGeometry(0.4, 0.32, 10), material(0x61757b), lighthouse, 0, 2.31);
      this.root.add(lighthouse);
      this.colliders.push({ normal: spherical(-13, -30), radius: 0.5 });
    }
  }

  /** Triangulate in authored coordinates, then split every long chord before projection.
   * Even the low water overlay stays outside the original radius between vertices.
   */
  private localeOverlay(level: AuthoredLevel, name: string, polygons: readonly (readonly BayPoint[])[], radiusAt: (p: BayPoint) => number, mat: THREE.MeshStandardMaterial, colorAt?: (p: BayPoint) => THREE.Color) {
    const positions: number[] = [], colors: number[] = [];
    const lengthSq = (a: BayPoint, b: BayPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const append = (a: BayPoint, b: BayPoint, c: BayPoint) => {
      const edges = [lengthSq(a, b), lengthSq(b, c), lengthSq(c, a)];
      const longest = Math.max(...edges);
      if (longest > level.definition.overlayMaxEdge ** 2) {
        // Longest-edge bisection avoids exploding an entire large triangle into a grid.
        const edge = edges.indexOf(longest);
        const [p, q, other] = edge === 0 ? [a, b, c] : edge === 1 ? [b, c, a] : [c, a, b];
        const midpoint = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        append(p, midpoint, other); append(midpoint, q, other);
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
    const overlay = mesh(geometry, mat, this.root, 0, 0, 0, false);
    overlay.name = name;
    overlay.userData.keepSurfaceGeometry = /-(land|water|road)$/.test(name);
    overlay.receiveShadow = true;
    return overlay;
  }

  private localeFrame(level: AuthoredLevel, p: BayPoint, facing: BayPoint, radius = level.definition.surfaceRadii.ground) {
    const normal = level.toNormal(p.x, p.y);
    const forward = level.toNormal(facing.x, facing.y);
    forward.addScaledVector(normal, -forward.dot(normal)).normalize();
    const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
    const group = new THREE.Group();
    group.position.copy(normal).multiplyScalar(radius);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, forward));
    return group;
  }

  private localePrefix(level: AuthoredLevel): 'bay' | 'station' | 'garden' {
    return level instanceof GardenLevel ? 'garden' : level instanceof StationLevel ? 'station' : 'bay';
  }

  private localeArrow(level: AuthoredLevel, p: BayPoint, direction: BayPoint, scale = 1, color = PALETTE.orange) {
    const d = Math.hypot(direction.x, direction.y);
    const x = direction.x / d, y = direction.y / d;
    const shape = [[-0.40, -0.12], [0.08, -0.12], [0.08, -0.28], [0.46, 0], [0.08, 0.28], [0.08, 0.12], [-0.40, 0.12]];
    const polygon = shape.map(([a, b]) => ({ x: p.x + (x * a - y * b) * scale, y: p.y + (y * a + x * b) * scale }));
    this.localeOverlay(level, `${this.localePrefix(level)}-route-arrow`, [polygon], q => level.sampleSurface(level.toNormal(q.x, q.y)).radius + 0.012, material(color));
  }

  /** Canvas is optional: arrows, colors and physical signboards still exist in Node. */
  private localePlaque(level: AuthoredLevel, parent: THREE.Object3D, label: string, width: number, height: number, y: number, z: number, ink = '#655747') {
    mesh(new THREE.BoxGeometry(width + 0.09, height + 0.06, 0.06), material(PALETTE.cream), parent, 0, y, z);
    if (typeof document === 'undefined') return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 768; canvas.height = 160;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffebcb'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = ink; context.font = 'bold 69px sans-serif';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 30);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const text = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }), parent, 0, y, z + 0.032, false);
      text.name = `${this.localePrefix(level)}-label-${label.toLowerCase().replaceAll(' ', '-')}`;
    } catch { /* Browsers with disabled canvas can still play; Node never enters here. */ }
  }

  private buildBayLocale() {
    const level = this.bayLevel!;
    const radii = level.definition.surfaceRadii;
    const sand = new THREE.Color(0xead5a8), mint = new THREE.Color(PALETTE.grass);
    const shallow = new THREE.Color(0x8ad8ce), blue = new THREE.Color(0x479cae);
    this.localeOverlay(level, 'bay-land', [BAY_LEVEL.landPolygon], () => radii.ground,
      material(0xffffff, { vertexColors: true, roughness: 1 }), p => {
        const coast = Math.min(1, level.distanceToShore(p.x, p.y) / 1.1);
        const color = sand.clone().lerp(mint, coast);
        const landing = BAY_LEVEL.landingRegion;
        if (p.x >= landing.minX && p.x <= landing.maxX && p.y >= landing.minY && p.y <= landing.maxY) color.lerp(new THREE.Color(0xb5d7b4), 0.65);
        return color;
      });
    this.localeOverlay(level, 'bay-water', [BAY_LEVEL.waterPolygon], () => radii.water,
      material(0xffffff, { vertexColors: true, roughness: 0.68, metalness: 0.02 }), p => shallow.clone().lerp(blue, Math.min(1, level.distanceToShore(p.x, p.y) / 0.85)));
    const circle = Array.from({ length: 64 }, (_, i) => ({
      x: BAY_LEVEL.pad.center.x + Math.cos(i / 64 * Math.PI * 2) * BAY_LEVEL.pad.radius,
      y: BAY_LEVEL.pad.center.y + Math.sin(i / 64 * Math.PI * 2) * BAY_LEVEL.pad.radius,
    }));
    this.localeOverlay(level, 'bay-road', [...Object.values(BAY_LEVEL.roads).map(road => road.polygon), circle], () => radii.road, material(PALETTE.road, { roughness: 0.96 }));
    this.buildBayRamp();
    this.localeArrow(level, { x: -6, y: 1.2 }, { x: 0, y: 1 }, 0.82, 0x4d927c);
    this.localeArrow(level, { x: -5.45, y: 0 }, { x: 1, y: 0 }, 0.65);
    this.localeArrow(level, { x: -3.65, y: 0 }, { x: 1, y: 0 }, 0.9);
    this.localeArrow(level, { x: 5.8, y: 0 }, { x: 1, y: 0 }, 0.85, 0xfff2d5);

    const sign = this.localeFrame(level, { x: -6.15, y: -1.55 }, { x: -8, y: -1.55 });
    sign.name = 'bay-fork-sign';
    mesh(new THREE.BoxGeometry(0.1, 1.28, 0.1), material(0x866b51), sign, 0, 0.64);
    this.localePlaque(level, sign, 'SAFE ROAD', 1.12, 0.24, 1.19, 0.04, '#427760');
    this.localePlaque(level, sign, 'BAY JUMP', 1.12, 0.24, 0.83, 0.04, '#ad6245');
    // Non-text directional silhouettes survive the no-canvas fallback.
    for (const [height, color, angle] of [[1.19, 0x589880, Math.PI / 2], [0.83, PALETTE.orange, 0]]) {
      const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.73, height, 0.04);
      arrow.rotation.z = angle;
    }
    this.root.add(sign);

    // Small, bounded wave glints, all strictly inside the SAME sampled water polygon.
    const waveGeometry = new THREE.BoxGeometry(0.34, 0.008, 0.027);
    for (const p of [{ x: -0.8, y: 1.2 }, { x: 0.9, y: -0.3 }, { x: -0.6, y: -1.6 }, { x: 1.5, y: -3.2 }, { x: -2, y: -4.5 }]) {
      if (!inBayPolygon(p, BAY_LEVEL.waterPolygon)) continue;
      const wave = this.localeFrame(level, p, { x: p.x, y: p.y + 1 }, radii.water + 0.009);
      mesh(waveGeometry, material(0xc4eee0), wave, 0, 0, 0, false);
      mesh(waveGeometry, material(0xa0ded4), wave, 0.16, 0, 0.15, false).scale.x = 0.6;
      this.root.add(wave);
    }
    // Low landing chevrons sit OUTSIDE the usable 3.3 m-wide landing area.
    for (const x of [3.1, 4.8, 6.5]) for (const y of [-1.84, 1.84]) {
      this.localeOverlay(level, 'bay-landing-marker', [[{ x: x - 0.13, y: y - 0.12 }, { x: x + 0.13, y: y - 0.12 }, { x: x + 0.13, y: y + 0.12 }, { x: x - 0.13, y: y + 0.12 }]], () => radii.ground + 0.012, material(0xfff1cf));
    }
    this.buildBayBakery();
  }

  private buildBayRamp() {
    const level = this.bayLevel!, ramp = BAY_LEVEL.ramp;
    const vertices: number[] = [], indices: number[] = [];
    const rows = 24, columns = 8;
    for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
      const x = ramp.base.x + ramp.length * row / rows, y = ramp.base.y + ramp.width * (column / columns - 0.5);
      vertices.push(...level.toNormal(x, y).multiplyScalar(level.rampRadiusAt(x)).toArray());
      if (row < rows && column < columns) {
        const k = row * (columns + 1) + column;
        indices.push(k, k + columns + 1, k + 1, k + 1, k + columns + 1, k + columns + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const deck = mesh(geometry, material(0xffe8b7, { roughness: 0.91 }), this.root, 0, 0, 0, false);
    deck.name = 'bay-ramp-deck'; deck.receiveShadow = true;
    const sideVertices: number[] = [];
    const wall = (ax: number, ay: number, bx: number, by: number) => {
      const a = level.toNormal(ax, ay), b = level.toNormal(bx, by);
      const lowerA = a.clone().multiplyScalar(BAY_LEVEL.surfaceRadii.ground);
      const upperA = a.multiplyScalar(level.rampRadiusAt(ax));
      const lowerB = b.clone().multiplyScalar(BAY_LEVEL.surfaceRadii.ground);
      const upperB = b.multiplyScalar(level.rampRadiusAt(bx));
      for (const p of [lowerA, lowerB, upperA, upperA, lowerB, upperB]) sideVertices.push(...p.toArray());
    };
    for (let i = 0; i < rows; i++) for (const side of [-1, 1]) {
      wall(ramp.base.x + ramp.length * i / rows, side * ramp.width / 2, ramp.base.x + ramp.length * (i + 1) / rows, side * ramp.width / 2);
    }
    // Visible launch face, never a physical wall: the sampler owns support/launch.
    for (let i = 0; i < columns; i++) wall(ramp.lip.x, ramp.width * (i / columns - 0.5), ramp.lip.x, ramp.width * ((i + 1) / columns - 0.5));
    const sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute(sideVertices, 3)); sides.computeVertexNormals();
    mesh(sides, material(0xe88d5e, { side: THREE.DoubleSide }), this.root);
    for (const y of [-ramp.width / 2, ramp.width / 2 - 0.105]) {
      this.localeOverlay(level, 'bay-ramp-edge', [[{ x: ramp.base.x, y }, { x: ramp.lip.x, y }, { x: ramp.lip.x, y: y + 0.105 }, { x: ramp.base.x, y: y + 0.105 }]], p => level.rampRadiusAt(p.x) + 0.008, material(PALETTE.orange));
    }
    this.localeOverlay(level, 'bay-ramp-lip', [[{ x: ramp.lip.x - 0.10, y: -ramp.width / 2 }, { x: ramp.lip.x, y: -ramp.width / 2 }, { x: ramp.lip.x, y: ramp.width / 2 }, { x: ramp.lip.x - 0.10, y: ramp.width / 2 }]], p => level.rampRadiusAt(p.x) + 0.012, material(0xffffff));
  }

  private buildBayBakery() {
    const level = this.bayLevel!, authored = BAY_LEVEL.bakery;
    const bakery = this.localeFrame(level, authored.center, authored.facing);
    bakery.name = 'bay-bakery';
    this.root.add(bakery);
    const wall = material(0xf2ce9c), trim = material(PALETTE.cream), wood = material(0x76604c);
    // An actual hollow doorway: side piers/header, back and side walls, not a solid box.
    mesh(new THREE.BoxGeometry(2.08, 1.52, 0.12), wall, bakery, 0, 0.78, -0.65);
    for (const x of [-0.99, 0.99]) mesh(new THREE.BoxGeometry(0.12, 1.52, 1.4), wall, bakery, x, 0.78, 0);
    for (const x of [-0.7, 0.7]) mesh(new THREE.BoxGeometry(0.69, 1.52, 0.13), wall, bakery, x, 0.78, 0.65);
    mesh(new THREE.BoxGeometry(0.72, 0.48, 0.13), wall, bakery, 0, 1.30, 0.65);
    mesh(new THREE.BoxGeometry(0.72, 1.06, 0.06), material(0x54473d), bakery, 0, 0.55, -0.34);
    mesh(new THREE.BoxGeometry(2.17, 0.10, 1.50), trim, bakery, 0, 0.01, 0);
    for (const x of [-0.35, 0.35]) mesh(new THREE.BoxGeometry(0.065, 1.06, 0.18), trim, bakery, x, 0.56, 0.71);
    mesh(new THREE.BoxGeometry(0.76, 0.08, 0.18), trim, bakery, 0, 1.07, 0.71);
    const roof = new THREE.Shape();
    roof.moveTo(-1.18, 0); roof.lineTo(1.18, 0); roof.lineTo(0, 0.67); roof.closePath();
    mesh(new THREE.ExtrudeGeometry(roof, { depth: 1.68, bevelEnabled: false }), material(0xc37e63), bakery, 0, 1.54, -0.84);
    mesh(new THREE.BoxGeometry(0.25, 0.57, 0.25), trim, bakery, 0.65, 1.98, -0.33);
    const awning = mesh(new THREE.BoxGeometry(2.2, 0.085, 0.62), material(PALETTE.orange), bakery, 0, 1.20, 0.95);
    awning.rotation.x = 0.12;
    for (let i = -4; i <= 4; i++) {
      const stripe = mesh(new THREE.BoxGeometry(0.11, 0.09, 0.63), trim, bakery, i * 0.24, 1.20, 0.95, false);
      stripe.rotation.x = 0.12;
    }
    this.localePlaque(level, bakery, 'SUNRISE BAKERY', 1.68, 0.29, 1.58, 0.82);
    for (const x of [-0.8, 0.8]) {
      mesh(new THREE.BoxGeometry(0.32, 0.22, 0.29), material(0xb17f62), bakery, x, 0.13, 0.91);
      for (const dx of [-0.08, 0.08]) {
        mesh(new THREE.IcosahedronGeometry(0.15, 0), material(0x689775), bakery, x + dx, 0.32, 0.91);
        mesh(new THREE.IcosahedronGeometry(0.048, 0), material(0xffdf9b), bakery, x + dx, 0.44, 0.95, false);
      }
    }

    const animation = new THREE.Group();
    animation.name = 'bay-bakery-animation'; bakery.add(animation);
    // The cache belongs to all houses; animate ONLY this clone, never the pooled material.
    const windowMaterial = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.20 }).clone();
    for (const [i, x] of [-0.72, 0.72].entries()) {
      mesh(new THREE.BoxGeometry(0.43, 0.49, 0.065), trim, bakery, x, 0.78, 0.735);
      const window = mesh(new THREE.BoxGeometry(0.34, 0.39, 0.065), windowMaterial, animation, x, 0.78, 0.775, false);
      window.name = `bay-bakery-window-${i}`;
      mesh(new THREE.BoxGeometry(0.035, 0.4, 0.02), trim, bakery, x, 0.78, 0.814, false);
      mesh(new THREE.BoxGeometry(0.35, 0.035, 0.02), trim, bakery, x, 0.78, 0.814, false);
    }
    const hinge = new THREE.Group();
    hinge.name = 'bay-door-hinge'; hinge.position.set(-0.31, 0.04, 0.73); animation.add(hinge);
    const door = mesh(new THREE.BoxGeometry(0.62, 0.97, 0.075), material(0x649783), hinge, 0.31, 0.485);
    door.name = 'bay-door';
    mesh(new THREE.BoxGeometry(0.40, 0.34, 0.025), trim, hinge, 0.31, 0.66, 0.048);
    mesh(new THREE.SphereGeometry(0.035, 8, 6), wood, hinge, 0.54, 0.43, 0.066);

    const recipient = new THREE.Group();
    recipient.name = 'bay-recipient'; animation.add(recipient);
    const skin = material(0xe7ad7b), apron = material(0xffefd3);
    mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), material(0xa0bf9b), recipient, 0, 0.36, 0);
    mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), apron, recipient, 0, 0.37, 0.15);
    for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.10, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
    mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
    mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.11, 10), apron, recipient, 0, 0.84);
    mesh(new THREE.IcosahedronGeometry(0.22, 1), apron, recipient, 0, 0.97).scale.set(1, 0.6, 0.8);
    for (const x of [-0.057, 0.057]) mesh(new THREE.SphereGeometry(0.015, 6, 5), material(0x52473f), recipient, x, 0.70, 0.15, false);
    const arm = new THREE.Group(); arm.name = 'bay-recipient-wave'; arm.position.set(-0.16, 0.51, 0); recipient.add(arm);
    mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), apron, arm, -0.045, 0.11);
    mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
    const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), apron, recipient, 0.17, 0.43, 0.13);
    holdingArm.rotation.x = -0.95;

    const parcel = new THREE.Group(); parcel.name = 'bay-handoff-parcel'; animation.add(parcel);
    mesh(new THREE.BoxGeometry(0.32, 0.28, 0.27), material(0xdcb783), parcel);
    mesh(new THREE.BoxGeometry(0.045, 0.29, 0.28), trim, parcel);
    mesh(new THREE.BoxGeometry(0.33, 0.035, 0.28), trim, parcel);
    this.bakeryReaction = { root: animation, hinge, recipient, arm, parcel, windowMaterial, parcelStartWorld: new THREE.Vector3(), elapsed: 0, started: false };
    this.colliders.push({ normal: this.bayLevel!.toNormal(authored.center.x, authored.center.y), radius: authored.colliderRadius });
    this.resetBayDelivery();
  }

  private buildStationLocale() {
    const level = this.stationLevel!, data = STATION_LEVEL, radii = level.definition.surfaceRadii;
    this.localeOverlay(level, 'station-land', [data.landPolygon], () => radii.ground, material(PALETTE.grass, { roughness: 1 }));
    const pad = Array.from({ length: 64 }, (_, i) => ({
      x: Math.cos(i / 64 * Math.PI * 2) * data.pad.radius,
      y: Math.sin(i / 64 * Math.PI * 2) * data.pad.radius,
    }));
    this.localeOverlay(level, 'station-road', [...Object.values(data.roads).map(road => road.polygon), pad], () => radii.road, material(PALETTE.road, { roughness: 0.96 }));
    for (const arrow of data.arrows) this.localeArrow(level, arrow.position, arrow.direction, 0.8, arrow.route === 'outer' ? 0x4d927c : PALETTE.orange);
    for (const x of [-7.3, -7, -6.7]) {
      this.localeOverlay(level, 'station-brake-marking', [[{ x, y: -0.54 }, { x: x + 0.11, y: -0.54 }, { x: x + 0.11, y: 0.54 }, { x, y: 0.54 }]], () => radii.road + 0.013, material(PALETTE.orange));
    }
    const sign = this.localeFrame(level, { x: -8.3, y: 1.3 }, { x: -10, y: 1.3 });
    sign.name = 'station-fork-sign';
    mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), material(0x866b51), sign, 0, 0.675);
    this.localePlaque(level, sign, 'OUTER ROAD', 1.3, 0.25, 1.25, 0.04, '#427760');
    this.localePlaque(level, sign, 'INNER LANE', 1.3, 0.25, 0.9, 0.04, '#ad6245');
    for (const [height, color, angle] of [[1.25, 0x589880, -Math.PI / 2], [0.9, PALETTE.orange, 0]]) {
      const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.85, height, 0.04);
      arrow.rotation.z = angle;
    }
    this.root.add(sign);

    for (const [index, obstacle] of data.obstacles.entries()) {
      const group = this.localeFrame(level, obstacle.center, { x: obstacle.center.x, y: obstacle.center.y + 1 });
      group.name = `station-obstacle-${index}`;
      const r = obstacle.radius;
      if (obstacle.kind === 'rock') {
        mesh(new THREE.CylinderGeometry(r * 0.64, r, r * 0.8, 7), material(0x96a99e), group, 0, r * 0.4);
        mesh(new THREE.IcosahedronGeometry(r * 0.64, 0), material(0xadc1ad), group, 0.04, r * 0.72).scale.y = 0.5;
      } else {
        mesh(new THREE.CylinderGeometry(r, r * 0.94, 0.34, 18), material(0xd5bf9d), group, 0, 0.17);
        mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 18), material(0x738b6b), group, 0, 0.36);
        for (let i = 0; i < 6; i++) {
          const angle = i / 6 * Math.PI * 2;
          const x = Math.cos(angle) * r * 0.52, z = Math.sin(angle) * r * 0.52;
          mesh(new THREE.IcosahedronGeometry(r * 0.27, 0), material(PALETTE.leaf), group, x, 0.55, z);
          mesh(new THREE.IcosahedronGeometry(0.08, 0), material(i % 2 ? 0xf6b87b : 0xc6b6ea), group, x, 0.77, z, false);
        }
      }
      this.root.add(group);
      this.colliders.push({ normal: level.toNormal(obstacle.center.x, obstacle.center.y), radius: r });
    }
    this.buildStationObservatory();
  }

  private buildStationObservatory() {
    const level = this.stationLevel!, authored = STATION_LEVEL.station;
    const station = this.localeFrame(level, authored.center, authored.facing);
    station.name = 'station-observatory';
    this.root.add(station);
    const cream = material(PALETTE.cream), wood = material(0x6b6155), purple = material(0xb1a6c8);
    mesh(new THREE.CylinderGeometry(0.97, 1.06, 0.12, 20), cream, station, 0, 0.06);
    mesh(new THREE.CylinderGeometry(0.9, 0.96, 1.05, 20), material(0xeedccc), station, 0, 0.58);
    mesh(new THREE.BoxGeometry(0.48, 0.7, 0.08), material(0x728b91), station, 0, 0.42, 0.92);
    this.localePlaque(level, station, 'STARGAZE STATION', 1.9, 0.28, 1.02, 1.04, '#665879');
    const animation = new THREE.Group();
    animation.name = 'station-observatory-animation'; station.add(animation);
    const lampMaterial = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.18 }).clone();
    for (const x of [-0.64, 0.64]) {
      mesh(new THREE.BoxGeometry(0.31, 0.37, 0.09), cream, station, x, 0.65, 0.68);
      const window = mesh(new THREE.BoxGeometry(0.23, 0.29, 0.10), lampMaterial, animation, x, 0.65, 0.74, false);
      window.name = 'station-warm-window';
    }
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), wood, station, 1.05, 0.625, 0.55);
    mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMaterial, animation, 1.05, 1.31, 0.55, false);
    const telescope = new THREE.Group(); telescope.name = 'station-telescope'; telescope.position.y = 1.08;
    animation.add(telescope);
    mesh(new THREE.SphereGeometry(0.92, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), material(0x929db4, { metalness: 0.22 }), telescope);
    const barrel = mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 12), material(0x526879), telescope, 0, 0.56, 0.43);
    barrel.rotation.x = 0.9;
    const lens = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 12), material(0x9bd9d1, { metalness: 0.25 }), telescope, 0, 0.91, 0.87, false);
    lens.rotation.x = 0.9;

    const recipient = new THREE.Group(); recipient.name = 'station-recipient'; animation.add(recipient);
    const skin = material(0xe7ad7b);
    mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), purple, recipient, 0, 0.36);
    mesh(new THREE.BoxGeometry(0.23, 0.08, 0.08), cream, recipient, 0, 0.51, 0.13);
    for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.10, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
    mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
    mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), purple, recipient, 0, 0.75);
    for (const x of [-0.057, 0.057]) mesh(new THREE.SphereGeometry(0.019, 6, 5), material(0x52473f), recipient, x, 0.70, 0.16, false);
    const arm = new THREE.Group(); arm.name = 'station-recipient-wave'; arm.position.set(-0.16, 0.51, 0); recipient.add(arm);
    mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), purple, arm, -0.045, 0.11);
    mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
    const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), purple, recipient, 0.17, 0.43, 0.13);
    holdingArm.rotation.x = -0.95;
    const parcel = new THREE.Group(); parcel.name = 'station-handoff-parcel'; animation.add(parcel);
    mesh(new THREE.BoxGeometry(0.34, 0.24, 0.09), cream, parcel);
    mesh(new THREE.BoxGeometry(0.08, 0.065, 0.015), purple, parcel, 0.09, 0.055, 0.053, false);
    this.stationReaction = new StationDeliveryReaction(animation, recipient, arm, parcel, telescope, lampMaterial, this.reducedMotion);
    this.colliders.push({ normal: this.stationLevel!.toNormal(authored.center.x, authored.center.y), radius: authored.colliderRadius });
  }

  private gardenFlower(parent: THREE.Object3D, x: number, z: number, color: number) {
    const plant = new THREE.Group(); plant.position.set(x, 0, z); parent.add(plant);
    mesh(new THREE.CylinderGeometry(0.023, 0.027, 0.4, 5), material(PALETTE.darkLeaf), plant, 0, 0.2);
    const leaf = mesh(new THREE.IcosahedronGeometry(0.12, 0), material(PALETTE.leaf), plant, 0.07, 0.18);
    leaf.scale.set(1, 0.3, 0.65);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      const petal = mesh(new THREE.SphereGeometry(0.085, 6, 4), material(color), plant, Math.cos(angle) * 0.10, 0.42, Math.sin(angle) * 0.10, false);
      petal.scale.y = 0.5;
    }
    mesh(new THREE.IcosahedronGeometry(0.068, 0), material(0xf5d48c), plant, 0, 0.445, 0, false);
    return plant;
  }

  private gardenBed(center: BayPoint, radius: number, planted = true) {
    const level = this.gardenLevel!;
    const group = this.localeFrame(level, center, { x: center.x, y: center.y + 1 });
    group.name = 'garden-flower-bed';
    mesh(new THREE.CylinderGeometry(radius, radius * 0.96, 0.28, 20), material(0xd8c3a1), group, 0, 0.14);
    mesh(new THREE.CylinderGeometry(radius * 0.91, radius * 0.91, 0.045, 20), material(0x778e68), group, 0, 0.30);
    if (planted) {
      const flowers = new THREE.Group(); flowers.position.y = 0.33; group.add(flowers);
      for (let i = 0; i < 7; i++) {
        const angle = i / 7 * Math.PI * 2;
        this.gardenFlower(flowers, Math.cos(angle) * radius * 0.58, Math.sin(angle) * radius * 0.58, [0xf3a77c, 0xffebcb, 0xc6b6ea][i % 3]);
      }
    }
    this.root.add(group);
    this.colliders.push({ normal: this.gardenLevel!.toNormal(center.x, center.y), radius });
    return group;
  }

  private buildGardenLocale() {
    const level = this.gardenLevel!, data = GARDEN_LEVEL, radii = level.definition.surfaceRadii;
    this.localeOverlay(level, 'garden-land', [data.landPolygon], () => radii.ground, material(PALETTE.grass, { roughness: 1 }));
    const pad = Array.from({ length: 64 }, (_, i) => ({
      x: Math.cos(i / 64 * Math.PI * 2) * data.pad.radius,
      y: Math.sin(i / 64 * Math.PI * 2) * data.pad.radius,
    }));
    this.localeOverlay(level, 'garden-road', [...Object.values(data.roads).map(road => road.polygon), pad], () => radii.road, material(PALETTE.road, { roughness: 0.96 }));
    for (const arrow of data.arrows) this.localeArrow(level, arrow.position, arrow.direction, 0.82, arrow.route === 'outer' ? 0x4d927c : PALETTE.orange);
    const sign = this.localeFrame(level, { x: -10.2, y: 1.25 }, { x: -12, y: 1.25 });
    sign.name = 'garden-fork-sign';
    mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), material(0x866b51), sign, 0, 0.675);
    this.localePlaque(level, sign, 'GARDEN LOOP', 1.4, 0.25, 1.25, 0.04, '#427760');
    this.localePlaque(level, sign, 'FLOWER PATH', 1.4, 0.25, 0.9, 0.04, '#ad6245');
    for (const [height, color, angle] of [[1.25, 0x589880, -Math.PI / 2], [0.9, PALETTE.orange, 0]]) {
      const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.9, height, 0.04);
      arrow.rotation.z = angle;
    }
    this.root.add(sign);
    for (const bed of data.beds) this.gardenBed(bed.center, bed.radius);
    const welcomeBed = this.gardenBed(data.welcomeBed.center, data.welcomeBed.radius, false);
    welcomeBed.name = 'garden-welcome-bed';
    const flowers = new THREE.Group(); flowers.name = 'garden-bloom-animation'; flowers.position.y = 0.33;
    welcomeBed.add(flowers);
    for (let i = 0; i < 3; i++) {
      const angle = i / 3 * Math.PI * 2;
      this.gardenFlower(flowers, Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, [0xf3a77c, 0xffebcb, 0xc6b6ea][i]);
    }
    this.buildGardenWindmill(flowers);
  }

  private buildGardenWindmill(flowers: THREE.Group) {
    const level = this.gardenLevel!, authored = GARDEN_LEVEL.windmill;
    const windmill = this.localeFrame(level, authored.center, authored.facing);
    windmill.name = 'garden-windmill'; this.root.add(windmill);
    const cream = material(PALETTE.cream), wood = material(0x7e6954), green = material(0x81a88a);
    mesh(new THREE.CylinderGeometry(0.85, 0.88, 0.13, 12), cream, windmill, 0, 0.065);
    mesh(new THREE.CylinderGeometry(0.33, 0.5, 1.8, 8), material(0xeedbbe), windmill, 0, 0.98);
    mesh(new THREE.ConeGeometry(0.55, 0.65, 8), material(0xbb866c), windmill, 0, 2.16);
    mesh(new THREE.BoxGeometry(0.3, 0.63, 0.055), green, windmill, 0, 0.39, 0.47);
    mesh(new THREE.BoxGeometry(0.17, 0.23, 0.055), material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.2 }), windmill, 0, 1.18, 0.4, false);
    this.localePlaque(level, windmill, 'WINDMILL GARDEN', 1.8, 0.27, 0.88, 0.67, '#427760');
    const rotor = new THREE.Group(); rotor.name = 'garden-windmill-rotor'; rotor.position.set(0, 1.74, 0.52);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Group(); blade.rotation.z = i * Math.PI / 2;
      mesh(new THREE.BoxGeometry(0.1, 1.2, 0.07), wood, blade, 0, 0.64);
      mesh(new THREE.BoxGeometry(0.27, 0.83, 0.06), cream, blade, 0.08, 0.80, 0.045);
      rotor.add(blade);
    }
    mesh(new THREE.SphereGeometry(0.15, 8, 6), material(0xe7b98c), rotor, 0, 0, 0.08);
    windmill.add(rotor); this.turbines.push(rotor);
    const animation = new THREE.Group(); animation.name = 'garden-recipient-animation'; windmill.add(animation);
    const recipient = new THREE.Group(); recipient.name = 'garden-recipient'; animation.add(recipient);
    const skin = material(0xe7ad7b);
    mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), green, recipient, 0, 0.36);
    mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), cream, recipient, 0, 0.37, 0.15);
    for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.10, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
    mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
    mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 12), material(0xe5c591), recipient, 0, 0.8);
    mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 12), material(0xe5c591), recipient, 0, 0.88);
    for (const x of [-0.057, 0.057]) mesh(new THREE.SphereGeometry(0.015, 6, 5), material(0x52473f), recipient, x, 0.70, 0.15, false);
    const arm = new THREE.Group(); arm.name = 'garden-recipient-wave'; arm.position.set(-0.16, 0.51, 0); recipient.add(arm);
    mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), green, arm, -0.045, 0.11);
    mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
    const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), green, recipient, 0.17, 0.43, 0.13);
    holdingArm.rotation.x = -0.95;
    const parcel = new THREE.Group(); parcel.name = 'garden-handoff-parcel'; animation.add(parcel);
    mesh(new THREE.BoxGeometry(0.31, 0.30, 0.075), cream, parcel);
    mesh(new THREE.BoxGeometry(0.04, 0.12, 0.015), green, parcel, 0, -0.02, 0.043, false);
    mesh(new THREE.IcosahedronGeometry(0.06, 0), material(PALETTE.orange), parcel, 0, 0.05, 0.05, false);
    this.gardenReaction = new GardenDeliveryReaction(animation, flowers, recipient, arm, parcel, this.reducedMotion);
    this.colliders.push({ normal: this.gardenLevel!.toNormal(authored.center.x, authored.center.y), radius: authored.colliderRadius });
  }

  private buildNature() {
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.64, 5);
    const foliageGeo = new THREE.IcosahedronGeometry(0.45, 0);
    const pineGeo = new THREE.ConeGeometry(0.43, 1.06, 6);
    const trunk = material(0x8b7760);
    const leafMaterials = [material(0x407c66), material(0x60957a), material(0x6da783), material(0xa7bd89)];
    const rockMat = material(0x8eaa9b);
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.20, 0), rockMat, 65);
    const dummy = new THREE.Object3D();
    let rockIndex = 0;
    for (let i = 0; i < 430; i++) {
      const n = spherical(Math.asin(this.random() * 2 - 1) * 180 / Math.PI, this.random() * 360 - 180);
      if (this.sceneryClearance(n) || this.terrain(n) < -0.02 || this.nearRoad(n, 1.05) || this.colliders.some(c => surfaceDistance(n, c.normal) < c.radius + 0.9) || this.destinations.some(d => surfaceDistance(n, d.normal) < 1.9)) continue;
      const group = align(n);
      const s = 0.6 + this.random() * 0.8;
      group.scale.setScalar(s);
      const pine = this.random() > 0.35;
      mesh(trunkGeo, trunk, group, 0, 0.25, 0);
      if (pine) {
        mesh(pineGeo, leafMaterials[i % 3], group, 0, 0.79, 0);
        const crown = mesh(pineGeo, leafMaterials[(i + 1) % 3], group, 0, 1.15, 0);
        crown.scale.setScalar(0.74);
      } else {
        mesh(foliageGeo, leafMaterials[i % 4], group, 0, 0.79, 0);
        const second = mesh(foliageGeo, leafMaterials[(i + 1) % 4], group, 0.21, 0.64, 0.08);
        second.scale.setScalar(0.72);
      }
      group.rotateY(this.random() * 6.28);
      this.root.add(group);
      this.colliders.push({ normal: n, radius: 0.22 * s });
    }
    for (let i = 0; i < 300 && rockIndex < 65; i++) {
      const n = spherical(this.random() * 150 - 75, this.random() * 360 - 180);
      if (this.sceneryClearance(n) || this.terrain(n) < -0.07 || this.nearRoad(n) || this.destinations.some(d => surfaceDistance(n, d.normal) < 2)) continue;
      dummy.position.copy(n).multiplyScalar(R + 0.07);
      dummy.quaternion.setFromUnitVectors(UP, n);
      dummy.scale.set(0.5 + this.random(), 0.5, 0.5 + this.random());
      dummy.updateMatrix();
      rocks.setMatrixAt(rockIndex++, dummy.matrix);
    }
    rocks.count = rockIndex;
    rocks.castShadow = true;
    this.root.add(rocks);

    const waveGeo = new THREE.BoxGeometry(0.3, 0.012, 0.025);
    const waveMat = material(0xa0d4c9, { transparent: true, opacity: 0.38 });
    for (let i = 0; i < 240; i++) {
      const n = spherical(this.random() * 170 - 85, this.random() * 360 - 180);
      if (this.sceneryClearance(n) || this.terrain(n) > -0.28 || this.nearRoad(n, 0.6)) continue;
      const wave = align(n, R + 0.025);
      mesh(waveGeo, waveMat, wave, 0, 0, 0, false);
      mesh(waveGeo, waveMat, wave, 0.12, 0, 0.12, false).scale.x = 0.6;
      this.root.add(wave);
    }
  }

  private buildClouds() {
    this.clouds.name = 'planet-clouds';
    const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
    const cloudMat = material(0xe9ede0, { transparent: true, opacity: 0.72, depthWrite: false });
    const positions = [[62, 54], [5, -52], [-30, 60], [52, -128], [-47, -100], [10, 155]];
    for (const [lat, lon] of positions) {
      const group = align(spherical(lat, lon), R + 2.1);
      for (let i = 0; i < 5; i++) {
        const puff = mesh(cloudGeo, cloudMat, group, (i - 2) * 0.53, this.random() * 0.13, this.random() * 0.16, false);
        puff.scale.set(0.53 + this.random() * 0.25, 0.22 + this.random() * 0.12, 0.40 + this.random() * 0.25);
      }
      this.clouds.add(group);
    }
    this.root.add(this.clouds);
  }

  private buildTargets() {
    this.destinations.forEach((destination, i) => {
      const level = this.destinationLevel(i);
      const station = this.tourLayout && level
        ? this.localeFrame(level, level.definition.pad.center, { x: level.definition.pad.center.x + 1, y: level.definition.pad.center.y }, level.definition.surfaceRadii.road)
        : align(destination.normal, level?.definition.surfaceRadii.road ?? R + 0.11);
      const padScale = this.tourLayout && level ? level.definition.pad.radius / BAY_LEVEL.pad.radius : 1;
      station.name = `${level ? this.localePrefix(level) : destination.id}-delivery-target`;
      if (!level) {
        const base = mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.03, 40), material(0xc5bc9c), station, 0, 0.01, 0, false);
        base.receiveShadow = true;
      }
      const mailbox = new THREE.Group();
      mailbox.name = `${level ? this.localePrefix(level) : destination.id}-mailbox`;
      // Tour pads have eastward through-roads: keep the mailbox beside the pad,
      // not on its incoming/outgoing centreline. Standalone placement is unchanged.
      mailbox.position.set(this.tourLayout && level ? level.definition.pad.radius + 0.2 : 0.98, 0, 0);
      mesh(new THREE.BoxGeometry(0.10, 0.49, 0.10), material(0x785f50), mailbox, 0, 0.24);
      mesh(new THREE.BoxGeometry(0.31, 0.29, 0.41), material(destination.color), mailbox, 0, 0.57);
      mesh(new THREE.BoxGeometry(0.21, 0.035, 0.02), material(0x5c655c), mailbox, 0, 0.6, 0.22);
      mesh(new THREE.BoxGeometry(0.07, 0.20, 0.02), material(0xffefc9), mailbox, 0.19, 0.7, 0.08);
      station.add(mailbox);
      this.root.add(station);
      const target = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({ color: destination.color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false });
      const ring = mesh(new THREE.RingGeometry(0.84 * padScale, 0.91 * padScale, 48), ringMat, target, 0, 0.055, 0, false);
      ring.rotation.x = -Math.PI / 2;
      const outer = mesh(new THREE.RingGeometry(1.00 * padScale, 1.035 * padScale, 48), ringMat, target, 0, 0.06, 0, false);
      outer.rotation.x = -Math.PI / 2;
      const beam = mesh(new THREE.CylinderGeometry(0.12, 0.66, 2.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: destination.color, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), target, 0, 1.48, 0, false);
      beam.renderOrder = 2;
      const icon = new THREE.Group();
      icon.position.y = 2.3;
      mesh(this.parcelGeometry, material(destination.color, { emissive: destination.color, emissiveIntensity: 0.12 }), icon);
      mesh(new THREE.BoxGeometry(0.075, 0.43, 0.43), material(0xffeed4), icon, 0, 0, 0, false);
      const pointer = mesh(new THREE.ConeGeometry(0.15, 0.23, 4), material(destination.color), icon, 0, -0.52, 0, false);
      pointer.rotation.x = Math.PI;
      target.add(icon);
      station.add(target);
      this.targetGroups.push(target);
      this.icons.push(icon);
      station.userData.index = i;
    });
  }

  private buildAtmosphere() {
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R + 0.45, 48, 32), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vNormal; varying vec3 vPosition; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vPosition = mv.xyz; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vPosition; void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPosition))), 3.5); gl_FragColor = vec4(0.38, 0.79, 0.73, rim * 0.16); }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    }));
    atmosphere.name = 'planet-atmosphere';
    this.root.add(atmosphere);
  }

  setActiveDestination(index: number) {
    this.activeIndex = index;
    this.targetGroups.forEach((target, i) => target.visible = i === index);
  }

  celebrate(normal: THREE.Vector3) {
    const basis = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    for (let i = 0; i < 26; i++) {
      const piece = mesh(this.particleGeometry, this.particleMaterials[i % 3], this.root, 0, 0, 0, false);
      piece.position.copy(normal).multiplyScalar(R + 0.6);
      const velocity = new THREE.Vector3((this.random() - 0.5) * 3, 1.5 + this.random() * 2.6, (this.random() - 0.5) * 3).applyQuaternion(basis);
      this.particles.push({ mesh: piece, velocity, life: 1.5 + this.random() * 0.5 });
    }
  }

  startDelivery(parcelStart: THREE.Vector3, index = 0): void {
    const level = this.destinationLevel(index);
    if (level instanceof GardenLevel) this.gardenReaction?.start(parcelStart);
    else if (level instanceof StationLevel) this.stationReaction?.start(parcelStart);
    else if (level instanceof BayLevel) this.startBayDelivery(parcelStart);
  }

  resetDelivery(): void {
    this.resetBayDelivery();
    this.stationReaction?.reset();
    this.gardenReaction?.reset();
  }

  getDeliveryReactionSnapshot(index = 0): DeliveryReactionSnapshot {
    const level = this.destinationLevel(index);
    if (level instanceof GardenLevel) return this.gardenReaction!.snapshot();
    if (level instanceof StationLevel) return this.stationReaction!.snapshot();
    if (level instanceof BayLevel || (!this.tourLayout && index === 0)) return this.getBayReactionSnapshot();
    return { active: false, progress: 0, recipientVisible: false, parcelVisible: false };
  }

  startBayDelivery(parcelStart: THREE.Vector3): void {
    const reaction = this.bakeryReaction;
    if (!reaction) return;
    this.resetBayDelivery();
    reaction.started = true;
    reaction.parcelStartWorld.copy(parcelStart);
    reaction.root.updateWorldMatrix(true, true);
    reaction.parcel.position.copy(reaction.root.worldToLocal(parcelStart.clone()));
    reaction.parcel.visible = true;
  }

  resetBayDelivery(): void {
    const reaction = this.bakeryReaction;
    if (!reaction) return;
    reaction.started = false; reaction.elapsed = 0;
    reaction.parcelStartWorld.set(0, 0, 0);
    reaction.hinge.rotation.set(0, 0, 0);
    reaction.recipient.position.set(0, 0.06, 0.10);
    reaction.recipient.rotation.set(0, 0, 0);
    reaction.recipient.scale.setScalar(1);
    reaction.recipient.visible = false;
    reaction.arm.rotation.set(0, 0, 0);
    reaction.parcel.position.set(0, 0, 0);
    reaction.parcel.rotation.set(0, 0, 0);
    reaction.parcel.scale.setScalar(1);
    reaction.parcel.visible = false;
    reaction.windowMaterial.emissiveIntensity = 0.20;
    for (const particle of this.splashParticles) {
      particle.life = 0;
      particle.mesh.visible = false;
    }
  }

  getBayReactionSnapshot(): { active: boolean; progress: number; doorOpen: number; recipientVisible: boolean; parcelVisible: boolean; windowGlow: number } {
    const r = this.bakeryReaction;
    return {
      active: !!r?.started && r.elapsed < BAY_LEVEL.reactionDuration,
      progress: r?.started ? Math.min(1, r.elapsed / BAY_LEVEL.reactionDuration) : 0,
      doorOpen: r ? Math.max(0, -r.hinge.rotation.y / 1.35) : 0,
      recipientVisible: r?.recipient.visible ?? false,
      parcelVisible: r?.parcel.visible ?? false,
      windowGlow: r?.windowMaterial.emissiveIntensity ?? 0,
    };
  }

  private updateBayDelivery(dt: number) {
    const r = this.bakeryReaction;
    if (!r?.started || r.elapsed >= BAY_LEVEL.reactionDuration || !Number.isFinite(dt) || dt <= 0) return;
    r.elapsed = Math.min(BAY_LEVEL.reactionDuration, r.elapsed + dt);
    const smooth = (t: number) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    r.hinge.rotation.y = -1.35 * smooth(r.elapsed / 0.65);
    r.windowMaterial.emissiveIntensity = 0.20 + smooth(r.elapsed / 0.8);
    r.recipient.visible = r.elapsed >= 0.20;
    r.recipient.position.z = 0.10 + 0.96 * smooth((r.elapsed - 0.20) / 0.65);
    const wave = smooth((r.elapsed - 0.65) / 0.3);
    r.arm.rotation.z = wave * (this.reducedMotion ? -0.3 : -0.45 + Math.sin((r.elapsed - 0.65) * 11) * 0.36);
    const handoff = smooth((r.elapsed - 0.48) / 1.02);
    r.root.updateWorldMatrix(true, true);
    const destinationWorld = r.recipient.localToWorld(new THREE.Vector3(0.08, 0.46, 0.28));
    const positionWorld = r.parcelStartWorld.clone().lerp(destinationWorld, handoff);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(r.root.matrixWorld);
    positionWorld.addScaledVector(up, Math.sin(handoff * Math.PI) * (this.reducedMotion ? 0.15 : 0.62));
    r.parcel.position.copy(r.root.worldToLocal(positionWorld));
    r.parcel.rotation.set(0, this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.55, this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.18);
  }

  /** A fixed-size pool; repeated falls never grow permanent scene objects. */
  splash(normal: THREE.Vector3): void {
    if (!this.bayLevel) return;
    const basis = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    for (let i = 0; i < 20; i++) {
      let particle = this.splashParticles[i];
      if (!particle) {
        const piece = mesh(this.particleGeometry, this.splashMaterials[i % this.splashMaterials.length], this.root, 0, 0, 0, false);
        piece.name = 'bay-splash-particle';
        particle = { mesh: piece, velocity: new THREE.Vector3(), life: 0 };
        this.splashParticles.push(particle);
      }
      particle.life = 0.65 + this.random() * 0.45;
      particle.mesh.position.copy(normal).multiplyScalar(BAY_LEVEL.surfaceRadii.water + 0.1);
      particle.mesh.rotation.set(0, 0, 0);
      particle.mesh.scale.setScalar(1);
      particle.mesh.visible = true;
      particle.velocity.set((this.random() - 0.5) * 2.4, 1.4 + this.random() * 1.7, (this.random() - 0.5) * 2.4).applyQuaternion(basis);
    }
  }

  update(dt: number, time: number, paused = false) {
    if (!paused) {
      this.updateBayDelivery(dt);
      this.stationReaction?.update(dt);
      this.gardenReaction?.update(dt);
    }
    for (const p of this.splashParticles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.visible = p.life > 0;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.addScaledVector(p.mesh.position.clone().normalize(), -dt * 5);
      p.mesh.scale.setScalar(Math.max(0, Math.min(1, p.life * 3)));
    }
    this.clouds.rotation.y += dt * 0.008;
    this.turbines.forEach(rotor => rotor.rotation.z -= dt * 0.65);
    this.icons.forEach((icon, i) => {
      if (i !== this.activeIndex) return;
      icon.position.y = 2.15 + Math.sin(time * 2.6) * 0.15;
      icon.rotation.y = time * 0.7;
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.addScaledVector(p.mesh.position.clone().normalize(), -dt * 3.0);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.z += dt * 2;
      p.mesh.scale.setScalar(Math.min(1, p.life * 2));
      if (p.life <= 0) { this.root.remove(p.mesh); this.particles.splice(i, 1); }
    }
  }
}

export function createSpace(): THREE.Group {
  const group = new THREE.Group();
  const rand = seededRandom(301);
  for (let layer = 0; layer < 3; layer++) {
    const points: number[] = [];
    for (let i = 0; i < 450; i++) {
      const n = spherical(Math.asin(rand() * 2 - 1) * 180 / Math.PI, rand() * 360);
      points.push(...n.multiplyScalar(110 + rand() * 90).toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: [0xc5dedb, 0xf5ddbd, 0x849dab][layer], size: [0.12, 0.21, 0.15][layer], transparent: true, opacity: [0.55, 0.8, 0.55][layer], sizeAttenuation: true, depthWrite: false }));
    group.add(stars);
  }
  const saturn = new THREE.Group();
  saturn.position.set(-40, 24, -48);
  const body = mesh(new THREE.SphereGeometry(3.4, 28, 20), material(0x9e8e83), saturn, 0, 0, 0, false);
  body.rotation.z = 0.25;
  const ring = mesh(new THREE.RingGeometry(4.3, 6.9, 80), new THREE.MeshBasicMaterial({ color: 0xbdb6a5, transparent: true, opacity: 0.26, side: THREE.DoubleSide }), saturn, 0, 0, 0, false);
  ring.rotation.x = 1.17;
  ring.rotation.y = 0.24;
  saturn.rotation.z = -0.4;
  group.add(saturn);
  const moon = mesh(new THREE.IcosahedronGeometry(1.35, 1), material(0xb2aaa0), group, 35, 8, -36, false);
  moon.rotation.y = 1;
  return group;
}
