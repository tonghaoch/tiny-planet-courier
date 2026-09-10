import * as THREE from 'three';
import type { BayPoint } from '../bay-level';
import { GARDEN_LEVEL, GardenLevel } from '../garden-level';
import { GardenDeliveryReaction } from '../garden-reaction';
import { localeOverlay, localeFrame, localeArrow, localePlaque } from './locale-geometry';
import { PALETTE, material, mesh, type LocaleSceneContext } from './scenery-primitives';

function gardenFlower(parent: THREE.Object3D, x: number, z: number, color: number) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  parent.add(plant);
  mesh(new THREE.CylinderGeometry(0.023, 0.027, 0.4, 5), material(PALETTE.darkLeaf), plant, 0, 0.2);
  const leaf = mesh(new THREE.IcosahedronGeometry(0.12, 0), material(PALETTE.leaf), plant, 0.07, 0.18);
  leaf.scale.set(1, 0.3, 0.65);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = mesh(
      new THREE.SphereGeometry(0.085, 6, 4),
      material(color),
      plant,
      Math.cos(angle) * 0.1,
      0.42,
      Math.sin(angle) * 0.1,
      false,
    );
    petal.scale.y = 0.5;
  }
  mesh(new THREE.IcosahedronGeometry(0.068, 0), material(0xf5d48c), plant, 0, 0.445, 0, false);
  return plant;
}

function gardenBed(level: GardenLevel, context: LocaleSceneContext, center: BayPoint, radius: number, planted = true) {
  const { root, colliders } = context;
  const group = localeFrame(level, center, { x: center.x, y: center.y + 1 });
  group.name = 'garden-flower-bed';
  mesh(new THREE.CylinderGeometry(radius, radius * 0.96, 0.28, 20), material(0xd8c3a1), group, 0, 0.14);
  mesh(new THREE.CylinderGeometry(radius * 0.91, radius * 0.91, 0.045, 20), material(0x778e68), group, 0, 0.3);
  if (planted) {
    const flowers = new THREE.Group();
    flowers.position.y = 0.33;
    group.add(flowers);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      gardenFlower(
        flowers,
        Math.cos(angle) * radius * 0.58,
        Math.sin(angle) * radius * 0.58,
        [0xf3a77c, 0xffebcb, 0xc6b6ea][i % 3],
      );
    }
  }
  root.add(group);
  colliders.push({ normal: level.toNormal(center.x, center.y), radius });
  return group;
}

export function buildGardenScene(level: GardenLevel, context: LocaleSceneContext) {
  const { root } = context;
  const data = GARDEN_LEVEL,
    radii = level.definition.surfaceRadii;
  localeOverlay(
    root,
    level,
    'garden-land',
    [data.landPolygon],
    () => radii.ground,
    material(PALETTE.grass, { roughness: 1 }),
  );
  const pad = Array.from({ length: 64 }, (_, i) => ({
    x: Math.cos((i / 64) * Math.PI * 2) * data.pad.radius,
    y: Math.sin((i / 64) * Math.PI * 2) * data.pad.radius,
  }));
  localeOverlay(
    root,
    level,
    'garden-road',
    [...Object.values(data.roads).map(road => road.polygon), pad],
    () => radii.road,
    material(PALETTE.road, { roughness: 0.96 }),
  );
  for (const arrow of data.arrows)
    localeArrow(
      root,
      level,
      arrow.position,
      arrow.direction,
      0.82,
      arrow.route === 'outer' ? 0x4d927c : PALETTE.orange,
    );
  const sign = localeFrame(level, { x: -10.2, y: 1.25 }, { x: -12, y: 1.25 });
  sign.name = 'garden-fork-sign';
  mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), material(0x866b51), sign, 0, 0.675);
  localePlaque(level, sign, 'GARDEN LOOP', 1.4, 0.25, 1.25, 0.04, '#427760');
  localePlaque(level, sign, 'FLOWER PATH', 1.4, 0.25, 0.9, 0.04, '#ad6245');
  for (const [height, color, angle] of [
    [1.25, 0x589880, -Math.PI / 2],
    [0.9, PALETTE.orange, 0],
  ]) {
    const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.9, height, 0.04);
    arrow.rotation.z = angle;
  }
  root.add(sign);
  for (const bed of data.beds) gardenBed(level, context, bed.center, bed.radius);
  const welcomeBed = gardenBed(level, context, data.welcomeBed.center, data.welcomeBed.radius, false);
  welcomeBed.name = 'garden-welcome-bed';
  const flowers = new THREE.Group();
  flowers.name = 'garden-bloom-animation';
  flowers.position.y = 0.33;
  welcomeBed.add(flowers);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    gardenFlower(flowers, Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, [0xf3a77c, 0xffebcb, 0xc6b6ea][i]);
  }
  return buildGardenWindmill(level, context, flowers);
}

function buildGardenWindmill(level: GardenLevel, context: LocaleSceneContext, flowers: THREE.Group) {
  const { root, colliders, reducedMotion } = context;
  const authored = GARDEN_LEVEL.windmill;
  const windmill = localeFrame(level, authored.center, authored.facing);
  windmill.name = 'garden-windmill';
  root.add(windmill);
  const cream = material(PALETTE.cream),
    wood = material(0x7e6954),
    green = material(0x81a88a);
  mesh(new THREE.CylinderGeometry(0.85, 0.88, 0.13, 12), cream, windmill, 0, 0.065);
  mesh(new THREE.CylinderGeometry(0.33, 0.5, 1.8, 8), material(0xeedbbe), windmill, 0, 0.98);
  mesh(new THREE.ConeGeometry(0.55, 0.65, 8), material(0xbb866c), windmill, 0, 2.16);
  mesh(new THREE.BoxGeometry(0.3, 0.63, 0.055), green, windmill, 0, 0.39, 0.47);
  mesh(
    new THREE.BoxGeometry(0.17, 0.23, 0.055),
    material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.2 }),
    windmill,
    0,
    1.18,
    0.4,
    false,
  );
  localePlaque(level, windmill, 'WINDMILL GARDEN', 1.8, 0.27, 0.88, 0.67, '#427760');
  const rotor = new THREE.Group();
  rotor.name = 'garden-windmill-rotor';
  rotor.position.set(0, 1.74, 0.52);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = (i * Math.PI) / 2;
    mesh(new THREE.BoxGeometry(0.1, 1.2, 0.07), wood, blade, 0, 0.64);
    mesh(new THREE.BoxGeometry(0.27, 0.83, 0.06), cream, blade, 0.08, 0.8, 0.045);
    rotor.add(blade);
  }
  mesh(new THREE.SphereGeometry(0.15, 8, 6), material(0xe7b98c), rotor, 0, 0, 0.08);
  windmill.add(rotor);
  const animation = new THREE.Group();
  animation.name = 'garden-recipient-animation';
  windmill.add(animation);
  const recipient = new THREE.Group();
  recipient.name = 'garden-recipient';
  animation.add(recipient);
  const skin = material(0xe7ad7b);
  mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), green, recipient, 0, 0.36);
  mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), cream, recipient, 0, 0.37, 0.15);
  for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.1, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
  mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
  mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 12), material(0xe5c591), recipient, 0, 0.8);
  mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.16, 12), material(0xe5c591), recipient, 0, 0.88);
  for (const x of [-0.057, 0.057])
    mesh(new THREE.SphereGeometry(0.015, 6, 5), material(0x52473f), recipient, x, 0.7, 0.15, false);
  const arm = new THREE.Group();
  arm.name = 'garden-recipient-wave';
  arm.position.set(-0.16, 0.51, 0);
  recipient.add(arm);
  mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), green, arm, -0.045, 0.11);
  mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
  const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), green, recipient, 0.17, 0.43, 0.13);
  holdingArm.rotation.x = -0.95;
  const parcel = new THREE.Group();
  parcel.name = 'garden-handoff-parcel';
  animation.add(parcel);
  mesh(new THREE.BoxGeometry(0.31, 0.3, 0.075), cream, parcel);
  mesh(new THREE.BoxGeometry(0.04, 0.12, 0.015), green, parcel, 0, -0.02, 0.043, false);
  mesh(new THREE.IcosahedronGeometry(0.06, 0), material(PALETTE.orange), parcel, 0, 0.05, 0.05, false);
  const reaction = new GardenDeliveryReaction(animation, flowers, recipient, arm, parcel, reducedMotion);
  colliders.push({
    normal: level.toNormal(authored.center.x, authored.center.y),
    radius: authored.colliderRadius,
  });
  return { reaction, dynamicRoots: [animation, flowers], rotor };
}
