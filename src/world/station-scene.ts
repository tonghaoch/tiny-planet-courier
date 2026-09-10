import * as THREE from 'three';
import { STATION_LEVEL, StationLevel } from '../station-level';
import { StationDeliveryReaction } from '../station-reaction';
import { localeOverlay, localeFrame, localeArrow, localePlaque } from './locale-geometry';
import { PALETTE, material, mesh, type LocaleSceneContext } from './scenery-primitives';

export function buildStationScene(level: StationLevel, context: LocaleSceneContext) {
  const { root, colliders } = context;
  const data = STATION_LEVEL,
    radii = level.definition.surfaceRadii;
  localeOverlay(
    root,
    level,
    'station-land',
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
    'station-road',
    [...Object.values(data.roads).map(road => road.polygon), pad],
    () => radii.road,
    material(PALETTE.road, { roughness: 0.96 }),
  );
  for (const arrow of data.arrows)
    localeArrow(root, level, arrow.position, arrow.direction, 0.8, arrow.route === 'outer' ? 0x4d927c : PALETTE.orange);
  for (const x of [-7.3, -7, -6.7]) {
    localeOverlay(
      root,
      level,
      'station-brake-marking',
      [
        [
          { x, y: -0.54 },
          { x: x + 0.11, y: -0.54 },
          { x: x + 0.11, y: 0.54 },
          { x, y: 0.54 },
        ],
      ],
      () => radii.road + 0.013,
      material(PALETTE.orange),
    );
  }
  const sign = localeFrame(level, { x: -8.3, y: 1.3 }, { x: -10, y: 1.3 });
  sign.name = 'station-fork-sign';
  mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), material(0x866b51), sign, 0, 0.675);
  localePlaque(level, sign, 'OUTER ROAD', 1.3, 0.25, 1.25, 0.04, '#427760');
  localePlaque(level, sign, 'INNER LANE', 1.3, 0.25, 0.9, 0.04, '#ad6245');
  for (const [height, color, angle] of [
    [1.25, 0x589880, -Math.PI / 2],
    [0.9, PALETTE.orange, 0],
  ]) {
    const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.85, height, 0.04);
    arrow.rotation.z = angle;
  }
  root.add(sign);

  for (const [index, obstacle] of data.obstacles.entries()) {
    const group = localeFrame(level, obstacle.center, { x: obstacle.center.x, y: obstacle.center.y + 1 });
    group.name = `station-obstacle-${index}`;
    const r = obstacle.radius;
    if (obstacle.kind === 'rock') {
      mesh(new THREE.CylinderGeometry(r * 0.64, r, r * 0.8, 7), material(0x96a99e), group, 0, r * 0.4);
      mesh(new THREE.IcosahedronGeometry(r * 0.64, 0), material(0xadc1ad), group, 0.04, r * 0.72).scale.y = 0.5;
    } else {
      mesh(new THREE.CylinderGeometry(r, r * 0.94, 0.34, 18), material(0xd5bf9d), group, 0, 0.17);
      mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 18), material(0x738b6b), group, 0, 0.36);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * r * 0.52,
          z = Math.sin(angle) * r * 0.52;
        mesh(new THREE.IcosahedronGeometry(r * 0.27, 0), material(PALETTE.leaf), group, x, 0.55, z);
        mesh(new THREE.IcosahedronGeometry(0.08, 0), material(i % 2 ? 0xf6b87b : 0xc6b6ea), group, x, 0.77, z, false);
      }
    }
    root.add(group);
    colliders.push({ normal: level.toNormal(obstacle.center.x, obstacle.center.y), radius: r });
  }
  return buildStationObservatory(level, context);
}

function buildStationObservatory(level: StationLevel, context: LocaleSceneContext) {
  const { root, colliders, reducedMotion } = context;
  const authored = STATION_LEVEL.station;
  const station = localeFrame(level, authored.center, authored.facing);
  station.name = 'station-observatory';
  root.add(station);
  const cream = material(PALETTE.cream),
    wood = material(0x6b6155),
    purple = material(0xb1a6c8);
  mesh(new THREE.CylinderGeometry(0.97, 1.06, 0.12, 20), cream, station, 0, 0.06);
  mesh(new THREE.CylinderGeometry(0.9, 0.96, 1.05, 20), material(0xeedccc), station, 0, 0.58);
  mesh(new THREE.BoxGeometry(0.48, 0.7, 0.08), material(0x728b91), station, 0, 0.42, 0.92);
  localePlaque(level, station, 'STARGAZE STATION', 1.9, 0.28, 1.02, 1.04, '#665879');
  const animation = new THREE.Group();
  animation.name = 'station-observatory-animation';
  station.add(animation);
  const lampMaterial = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.18 }).clone();
  for (const x of [-0.64, 0.64]) {
    mesh(new THREE.BoxGeometry(0.31, 0.37, 0.09), cream, station, x, 0.65, 0.68);
    const window = mesh(new THREE.BoxGeometry(0.23, 0.29, 0.1), lampMaterial, animation, x, 0.65, 0.74, false);
    window.name = 'station-warm-window';
  }
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), wood, station, 1.05, 0.625, 0.55);
  mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMaterial, animation, 1.05, 1.31, 0.55, false);
  const telescope = new THREE.Group();
  telescope.name = 'station-telescope';
  telescope.position.y = 1.08;
  animation.add(telescope);
  mesh(
    new THREE.SphereGeometry(0.92, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    material(0x929db4, { metalness: 0.22 }),
    telescope,
  );
  const barrel = mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.1, 12), material(0x526879), telescope, 0, 0.56, 0.43);
  barrel.rotation.x = 0.9;
  const lens = mesh(
    new THREE.CylinderGeometry(0.135, 0.135, 0.025, 12),
    material(0x9bd9d1, { metalness: 0.25 }),
    telescope,
    0,
    0.91,
    0.87,
    false,
  );
  lens.rotation.x = 0.9;

  const recipient = new THREE.Group();
  recipient.name = 'station-recipient';
  animation.add(recipient);
  const skin = material(0xe7ad7b);
  mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), purple, recipient, 0, 0.36);
  mesh(new THREE.BoxGeometry(0.23, 0.08, 0.08), cream, recipient, 0, 0.51, 0.13);
  for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.1, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
  mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
  mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), purple, recipient, 0, 0.75);
  for (const x of [-0.057, 0.057])
    mesh(new THREE.SphereGeometry(0.019, 6, 5), material(0x52473f), recipient, x, 0.7, 0.16, false);
  const arm = new THREE.Group();
  arm.name = 'station-recipient-wave';
  arm.position.set(-0.16, 0.51, 0);
  recipient.add(arm);
  mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), purple, arm, -0.045, 0.11);
  mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
  const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), purple, recipient, 0.17, 0.43, 0.13);
  holdingArm.rotation.x = -0.95;
  const parcel = new THREE.Group();
  parcel.name = 'station-handoff-parcel';
  animation.add(parcel);
  mesh(new THREE.BoxGeometry(0.34, 0.24, 0.09), cream, parcel);
  mesh(new THREE.BoxGeometry(0.08, 0.065, 0.015), purple, parcel, 0.09, 0.055, 0.053, false);
  const reaction = new StationDeliveryReaction(
    animation,
    recipient,
    arm,
    parcel,
    telescope,
    lampMaterial,
    reducedMotion,
  );
  colliders.push({
    normal: level.toNormal(authored.center.x, authored.center.y),
    radius: authored.colliderRadius,
  });
  return { reaction, dynamicRoots: [animation] };
}
