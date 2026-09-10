import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PLANET_RADIUS as R,
  UP,
  seededRandom,
  spherical,
  surfaceDistance,
  type Collider,
  type Destination,
} from './math';
import { BAY_LEVEL, BayLevel } from './bay-level';
import type { AuthoredLevel } from './authored-level';
import { StationLevel } from './station-level';
import { BayDeliveryReaction } from './bay-reaction';
import { StationDeliveryReaction } from './station-reaction';
import { GardenLevel } from './garden-level';
import { GardenDeliveryReaction } from './garden-reaction';
import type { BayEnvironment, SurfacePose } from './bay-types';
import { TourLayout } from './tour-layout';
import { createTourConnectorGeometry } from './tour-world-geometry';
import { PALETTE, material, align, mesh } from './world/scenery-primitives';
import { localeFrame, localePrefix } from './world/locale-geometry';
import { buildBayScene } from './world/bay-scene';
import { buildStationScene } from './world/station-scene';
import { buildGardenScene } from './world/garden-scene';

const ROUTES = [
  [
    spherical(30, -180),
    spherical(30, -120),
    spherical(30, -60),
    spherical(30, 0),
    spherical(30, 60),
    spherical(30, 120),
    spherical(30, 180),
  ],
  [
    spherical(-70, 85),
    spherical(-35, 85),
    spherical(0, 85),
    spherical(35, 85),
    spherical(70, 85),
    spherical(85, 180),
    spherical(60, -95),
    spherical(20, -95),
    spherical(-30, -95),
    spherical(-70, -95),
    spherical(-85, 0),
    spherical(-70, 85),
  ],
  [spherical(30, 0), spherical(45, -15), spherical(48, -35), spherical(48, -50), spherical(30, -65)],
];

function interpolateRoad(nodes: THREE.Vector3[], count: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(nodes.map(n => n.clone().multiplyScalar(R)));
  return curve.getPoints(count).map(p => p.normalize());
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
    {
      id: 'bakery',
      name: 'Sunrise Bakery',
      label: 'SUNRISE BAKERY',
      parcel: 'A bag of warm croissants',
      normal: spherical(30, 28),
      color: 0xf6b87b,
    },
    {
      id: 'observatory',
      name: 'Stargaze Station',
      label: 'STARGAZE STATION',
      parcel: 'A letter from Earth',
      normal: spherical(-10, 85),
      color: 0xc6b6ea,
    },
    {
      id: 'windmill',
      name: 'Windmill Garden',
      label: 'WINDMILL GARDEN',
      parcel: 'Flower seeds for the gardener',
      normal: spherical(48, -50),
      color: 0x9bd6b3,
    },
  ];
  private readonly random = seededRandom(417);
  private readonly roads = ROUTES.map(route => interpolateRoad(route, 180));
  private readonly targetGroups: THREE.Group[] = [];
  private readonly icons: THREE.Group[] = [];
  private readonly clouds = new THREE.Group();
  private readonly turbines: THREE.Group[] = [];
  private readonly dynamicSceneryRoots: THREE.Group[] = [];
  private readonly particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private activeIndex = -1;
  private readonly parcelGeometry = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  private readonly particleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  private readonly particleMaterials = [material(0xf6ba78), material(0xffffff), material(0xa4e1b4)];
  private readonly splashMaterials = [material(0x81d8e0), material(0x459eb9), material(0xd8f4e8)];
  private readonly splashParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private bakeryReaction: BayDeliveryReaction | null = null;
  private stationReaction: StationDeliveryReaction | null = null;
  private gardenReaction: GardenDeliveryReaction | null = null;

  constructor(
    prototype: boolean | 'bay' | 'station' | 'garden' | 'tour' = false,
    private readonly reducedMotion = false,
  ) {
    this.tourLayout = prototype === 'tour' ? new TourLayout() : null;
    this.bayLevel =
      this.tourLayout?.stops[0].level ?? (prototype === true || prototype === 'bay' ? new BayLevel() : null);
    this.stationLevel = this.tourLayout?.stops[1].level ?? (prototype === 'station' ? new StationLevel() : null);
    this.gardenLevel = this.tourLayout?.stops[2].level ?? (prototype === 'garden' ? new GardenLevel() : null);
    this.authoredLevel = this.tourLayout ? null : (this.bayLevel ?? this.stationLevel ?? this.gardenLevel);
    const level = this.authoredLevel;
    this.drivingEnvironment = this.tourLayout
      ? this.tourLayout.createEnvironment(this.colliders)
      : level
        ? {
            spawnPose: level.spawnPose,
            recoveryPose: level.recoveryPose,
            colliders: this.colliders,
            sampleSurface: normal => level.sampleSurface(normal),
            crossRampLip: (previous, next) => level.crossRampLip(previous, next),
          }
        : null;
    this.bayEnvironment = this.drivingEnvironment;
    if (this.tourLayout) this.destinations = this.tourLayout.destinations;
    else if (level) this.destinations = [level.destination];
    this.buildPlanet();
    this.buildRoads();
    this.buildTourConnectors();
    this.buildSettlements();
    const scenery = { root: this.root, colliders: this.colliders, reducedMotion: this.reducedMotion };
    if (this.bayLevel) {
      const bay = buildBayScene(this.bayLevel, scenery);
      this.bakeryReaction = bay.reaction;
      this.dynamicSceneryRoots.push(...bay.dynamicRoots);
    }
    if (this.stationLevel) {
      const station = buildStationScene(this.stationLevel, scenery);
      this.stationReaction = station.reaction;
      this.dynamicSceneryRoots.push(...station.dynamicRoots);
    }
    if (this.gardenLevel) {
      const garden = buildGardenScene(this.gardenLevel, scenery);
      this.gardenReaction = garden.reaction;
      this.dynamicSceneryRoots.push(...garden.dynamicRoots);
      this.turbines.push(garden.rotor);
    }
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
    for (const root of this.dynamicSceneryRoots) animated.add(root);
    const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>();
    this.root.updateMatrixWorld(true);
    this.root.traverse(object => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      )
        return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (animated.has(parent)) return;
      }
      if (object.userData.keepSurfaceGeometry) return;
      // Projected overlays have position/normal (and sometimes color), while
      // primitive meshes also have UVs. Never ask Three to merge unlike schemas.
      const attributes = Object.keys(object.geometry.attributes)
        .sort()
        .map(name => {
          const attribute = object.geometry.getAttribute(name);
          return `${name}/${attribute.itemSize}/${attribute.normalized}`;
        })
        .join(',');
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

  heightAt(normal: THREE.Vector3): number {
    return this.drivingEnvironment?.sampleSurface(normal).radius ?? R + 0.105;
  }

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
    return (
      this.tourLayout?.isInSceneryClearance(normal, margin) ??
      this.authoredLevel?.isInSceneryClearance(normal, margin) ??
      false
    );
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
    return (
      Math.sin(n.x * 4.8 + n.z * 2.7) * 0.44 + Math.cos(n.y * 5.2 - n.x * 2) * 0.38 + Math.sin(n.z * 8 + n.y * 3) * 0.17
    );
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
        const leftPoint = n
          .clone()
          .multiplyScalar(R + 0.075)
          .addScaledVector(right, -0.52)
          .normalize()
          .multiplyScalar(R + 0.085);
        const rightPoint = n
          .clone()
          .multiplyScalar(R + 0.075)
          .addScaledVector(right, 0.52)
          .normalize()
          .multiplyScalar(R + 0.085);
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
    const windowMat = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.2 });
    const trim = material(PALETTE.cream);
    mesh(new THREE.BoxGeometry(0.95, 0.92, 0.82), wall, group, 0, 0.53, 0);
    mesh(new THREE.BoxGeometry(1.07, 0.12, 0.94), trim, group, 0, 0.11, 0);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.59, 0);
    roofShape.lineTo(0.59, 0);
    roofShape.lineTo(0, 0.57);
    roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.02, bevelEnabled: false });
    mesh(roofGeo, roofMat, group, 0, 0.97, -0.51);
    mesh(new THREE.BoxGeometry(0.22, 0.49, 0.06), wood, group, 0, 0.38, 0.43);
    for (const x of [-0.29, 0.29]) {
      mesh(new THREE.BoxGeometry(0.23, 0.27, 0.06), trim, group, x, 0.66, 0.44);
      mesh(new THREE.BoxGeometry(0.16, 0.2, 0.07), windowMat, group, x, 0.66, 0.46, false);
    }
    mesh(new THREE.BoxGeometry(0.2, 0.49, 0.22), trim, group, 0.28, 1.35, -0.17);
    if (style === 0) {
      const awning = mesh(new THREE.BoxGeometry(1.08, 0.09, 0.4), material(0xe99777), group, 0, 0.85, 0.59);
      awning.rotation.x = 0.12;
      for (let i = -2; i <= 2; i++)
        mesh(new THREE.BoxGeometry(0.1, 0.1, 0.41), trim, group, i * 0.2, 0.85, 0.59, false);
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
      mesh(new THREE.ConeGeometry(0.54, 0.6, 8), material(0xbb866c), windmill, 0, 2.15);
      const rotor = new THREE.Group();
      rotor.position.set(0, 1.75, 0.43);
      const wingMat = material(0xffecc8);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Group();
        blade.rotation.z = (i * Math.PI) / 2;
        mesh(new THREE.BoxGeometry(0.11, 1.2, 0.07), material(0x7e6954), blade, 0, 0.64, 0);
        mesh(new THREE.BoxGeometry(0.27, 0.83, 0.06), wingMat, blade, 0.08, 0.8, 0.045);
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
      mesh(
        new THREE.SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        material(0x8d9bad, { metalness: 0.22 }),
        observatory,
        0,
        0.88,
      );
      const telescope = mesh(
        new THREE.CylinderGeometry(0.13, 0.17, 0.89, 10),
        material(0x546a7a),
        observatory,
        0.1,
        1.34,
        0.43,
      );
      telescope.rotation.x = 0.9;
      this.root.add(observatory);
      this.colliders.push({ normal: spherical(-4, 92), radius: 0.75 });
    }

    if (!this.sceneryClearance(spherical(-13, -30))) {
      const lighthouse = align(spherical(-13, -30));
      for (let i = 0; i < 5; i++)
        mesh(
          new THREE.CylinderGeometry(0.3 - i * 0.02, 0.32 - i * 0.02, 0.36, 10),
          material(i % 2 ? 0xdf977d : 0xf8e6c6),
          lighthouse,
          0,
          0.18 + i * 0.36,
        );
      mesh(
        new THREE.CylinderGeometry(0.31, 0.31, 0.35, 10),
        material(0xffd58b, { emissive: 0xffc36d, emissiveIntensity: 0.6 }),
        lighthouse,
        0,
        1.98,
      );
      mesh(new THREE.ConeGeometry(0.4, 0.32, 10), material(0x61757b), lighthouse, 0, 2.31);
      this.root.add(lighthouse);
      this.colliders.push({ normal: spherical(-13, -30), radius: 0.5 });
    }
  }

  private buildNature() {
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.64, 5);
    const foliageGeo = new THREE.IcosahedronGeometry(0.45, 0);
    const pineGeo = new THREE.ConeGeometry(0.43, 1.06, 6);
    const trunk = material(0x8b7760);
    const leafMaterials = [material(0x407c66), material(0x60957a), material(0x6da783), material(0xa7bd89)];
    const rockMat = material(0x8eaa9b);
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), rockMat, 65);
    const dummy = new THREE.Object3D();
    let rockIndex = 0;
    for (let i = 0; i < 430; i++) {
      const n = spherical((Math.asin(this.random() * 2 - 1) * 180) / Math.PI, this.random() * 360 - 180);
      if (
        this.sceneryClearance(n) ||
        this.terrain(n) < -0.02 ||
        this.nearRoad(n, 1.05) ||
        this.colliders.some(c => surfaceDistance(n, c.normal) < c.radius + 0.9) ||
        this.destinations.some(d => surfaceDistance(n, d.normal) < 1.9)
      )
        continue;
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
      if (
        this.sceneryClearance(n) ||
        this.terrain(n) < -0.07 ||
        this.nearRoad(n) ||
        this.destinations.some(d => surfaceDistance(n, d.normal) < 2)
      )
        continue;
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
    const positions = [
      [62, 54],
      [5, -52],
      [-30, 60],
      [52, -128],
      [-47, -100],
      [10, 155],
    ];
    for (const [lat, lon] of positions) {
      const group = align(spherical(lat, lon), R + 2.1);
      for (let i = 0; i < 5; i++) {
        const puff = mesh(cloudGeo, cloudMat, group, (i - 2) * 0.53, this.random() * 0.13, this.random() * 0.16, false);
        puff.scale.set(0.53 + this.random() * 0.25, 0.22 + this.random() * 0.12, 0.4 + this.random() * 0.25);
      }
      this.clouds.add(group);
    }
    this.root.add(this.clouds);
  }

  private buildTargets() {
    this.destinations.forEach((destination, i) => {
      const level = this.destinationLevel(i);
      const station =
        this.tourLayout && level
          ? localeFrame(
              level,
              level.definition.pad.center,
              { x: level.definition.pad.center.x + 1, y: level.definition.pad.center.y },
              level.definition.surfaceRadii.road,
            )
          : align(destination.normal, level?.definition.surfaceRadii.road ?? R + 0.11);
      const padScale = this.tourLayout && level ? level.definition.pad.radius / BAY_LEVEL.pad.radius : 1;
      station.name = `${level ? localePrefix(level) : destination.id}-delivery-target`;
      if (!level) {
        const base = mesh(
          new THREE.CylinderGeometry(0.87, 0.87, 0.03, 40),
          material(0xc5bc9c),
          station,
          0,
          0.01,
          0,
          false,
        );
        base.receiveShadow = true;
      }
      const mailbox = new THREE.Group();
      mailbox.name = `${level ? localePrefix(level) : destination.id}-mailbox`;
      // Tour pads have eastward through-roads: keep the mailbox beside the pad,
      // not on its incoming/outgoing centreline. Standalone placement is unchanged.
      mailbox.position.set(this.tourLayout && level ? level.definition.pad.radius + 0.2 : 0.98, 0, 0);
      mesh(new THREE.BoxGeometry(0.1, 0.49, 0.1), material(0x785f50), mailbox, 0, 0.24);
      mesh(new THREE.BoxGeometry(0.31, 0.29, 0.41), material(destination.color), mailbox, 0, 0.57);
      mesh(new THREE.BoxGeometry(0.21, 0.035, 0.02), material(0x5c655c), mailbox, 0, 0.6, 0.22);
      mesh(new THREE.BoxGeometry(0.07, 0.2, 0.02), material(0xffefc9), mailbox, 0.19, 0.7, 0.08);
      station.add(mailbox);
      this.root.add(station);
      const target = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({
        color: destination.color,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = mesh(
        new THREE.RingGeometry(0.84 * padScale, 0.91 * padScale, 48),
        ringMat,
        target,
        0,
        0.055,
        0,
        false,
      );
      ring.rotation.x = -Math.PI / 2;
      const outer = mesh(
        new THREE.RingGeometry(1.0 * padScale, 1.035 * padScale, 48),
        ringMat,
        target,
        0,
        0.06,
        0,
        false,
      );
      outer.rotation.x = -Math.PI / 2;
      const beam = mesh(
        new THREE.CylinderGeometry(0.12, 0.66, 2.9, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: destination.color,
          transparent: true,
          opacity: 0.075,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        target,
        0,
        1.48,
        0,
        false,
      );
      beam.renderOrder = 2;
      const icon = new THREE.Group();
      icon.position.y = 2.3;
      mesh(
        this.parcelGeometry,
        material(destination.color, { emissive: destination.color, emissiveIntensity: 0.12 }),
        icon,
      );
      mesh(new THREE.BoxGeometry(0.075, 0.43, 0.43), material(0xffeed4), icon, 0, 0, 0, false);
      const pointer = mesh(
        new THREE.ConeGeometry(0.15, 0.23, 4),
        material(destination.color),
        icon,
        0,
        -0.52,
        0,
        false,
      );
      pointer.rotation.x = Math.PI;
      target.add(icon);
      station.add(target);
      this.targetGroups.push(target);
      this.icons.push(icon);
      station.userData.index = i;
    });
  }

  private buildAtmosphere() {
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R + 0.45, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vNormal; varying vec3 vPosition; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vPosition = mv.xyz; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vNormal; varying vec3 vPosition; void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPosition))), 3.5); gl_FragColor = vec4(0.38, 0.79, 0.73, rim * 0.16); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    atmosphere.name = 'planet-atmosphere';
    this.root.add(atmosphere);
  }

  setActiveDestination(index: number) {
    this.activeIndex = index;
    this.targetGroups.forEach((target, i) => (target.visible = i === index));
  }

  celebrate(normal: THREE.Vector3) {
    const basis = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    for (let i = 0; i < 26; i++) {
      const piece = mesh(this.particleGeometry, this.particleMaterials[i % 3], this.root, 0, 0, 0, false);
      piece.position.copy(normal).multiplyScalar(R + 0.6);
      const velocity = new THREE.Vector3(
        (this.random() - 0.5) * 3,
        1.5 + this.random() * 2.6,
        (this.random() - 0.5) * 3,
      ).applyQuaternion(basis);
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
    this.clearBaySplash();
    reaction.start(parcelStart);
  }

  resetBayDelivery(): void {
    const reaction = this.bakeryReaction;
    if (!reaction) return;
    reaction.reset();
    this.clearBaySplash();
  }

  private clearBaySplash(): void {
    for (const particle of this.splashParticles) {
      particle.life = 0;
      particle.mesh.visible = false;
    }
  }

  getBayReactionSnapshot(): {
    active: boolean;
    progress: number;
    doorOpen: number;
    recipientVisible: boolean;
    parcelVisible: boolean;
    windowGlow: number;
  } {
    return (
      this.bakeryReaction?.snapshot() ?? {
        active: false,
        progress: 0,
        doorOpen: 0,
        recipientVisible: false,
        parcelVisible: false,
        windowGlow: 0,
      }
    );
  }

  /** A fixed-size pool; repeated falls never grow permanent scene objects. */
  splash(normal: THREE.Vector3): void {
    if (!this.bayLevel) return;
    const basis = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    for (let i = 0; i < 20; i++) {
      let particle = this.splashParticles[i];
      if (!particle) {
        const piece = mesh(
          this.particleGeometry,
          this.splashMaterials[i % this.splashMaterials.length],
          this.root,
          0,
          0,
          0,
          false,
        );
        piece.name = 'bay-splash-particle';
        particle = { mesh: piece, velocity: new THREE.Vector3(), life: 0 };
        this.splashParticles.push(particle);
      }
      particle.life = 0.65 + this.random() * 0.45;
      particle.mesh.position.copy(normal).multiplyScalar(BAY_LEVEL.surfaceRadii.water + 0.1);
      particle.mesh.rotation.set(0, 0, 0);
      particle.mesh.scale.setScalar(1);
      particle.mesh.visible = true;
      particle.velocity
        .set((this.random() - 0.5) * 2.4, 1.4 + this.random() * 1.7, (this.random() - 0.5) * 2.4)
        .applyQuaternion(basis);
    }
  }

  update(dt: number, time: number, paused = false) {
    if (!paused) {
      this.bakeryReaction?.update(dt);
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
    this.turbines.forEach(rotor => (rotor.rotation.z -= dt * 0.65));
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
      if (p.life <= 0) {
        this.root.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}

export function createSpace(): THREE.Group {
  const group = new THREE.Group();
  const rand = seededRandom(301);
  for (let layer = 0; layer < 3; layer++) {
    const points: number[] = [];
    for (let i = 0; i < 450; i++) {
      const n = spherical((Math.asin(rand() * 2 - 1) * 180) / Math.PI, rand() * 360);
      points.push(...n.multiplyScalar(110 + rand() * 90).toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: [0xc5dedb, 0xf5ddbd, 0x849dab][layer],
        size: [0.12, 0.21, 0.15][layer],
        transparent: true,
        opacity: [0.55, 0.8, 0.55][layer],
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    group.add(stars);
  }
  const saturn = new THREE.Group();
  saturn.position.set(-40, 24, -48);
  const body = mesh(new THREE.SphereGeometry(3.4, 28, 20), material(0x9e8e83), saturn, 0, 0, 0, false);
  body.rotation.z = 0.25;
  const ring = mesh(
    new THREE.RingGeometry(4.3, 6.9, 80),
    new THREE.MeshBasicMaterial({ color: 0xbdb6a5, transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
    saturn,
    0,
    0,
    0,
    false,
  );
  ring.rotation.x = 1.17;
  ring.rotation.y = 0.24;
  saturn.rotation.z = -0.4;
  group.add(saturn);
  const moon = mesh(new THREE.IcosahedronGeometry(1.35, 1), material(0xb2aaa0), group, 35, 8, -36, false);
  moon.rotation.y = 1;
  return group;
}
