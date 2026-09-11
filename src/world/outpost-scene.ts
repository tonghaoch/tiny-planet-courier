import * as THREE from 'three';
import { BEACON_LEVEL, DEPOT_LEVEL, BeaconLevel, type DepotLevel } from '../tour-outposts';
import { OutpostDeliveryReaction } from '../outpost-reaction';
import { localeArrow, localeFrame, localeOverlay, localePlaque, localePrefix } from './locale-geometry';
import { material, mesh, PALETTE, type LocaleSceneContext } from './scenery-primitives';

export function buildOutpostScene(level: BeaconLevel | DepotLevel, context: LocaleSceneContext) {
  const beacon = level instanceof BeaconLevel;
  const data = beacon ? BEACON_LEVEL : DEPOT_LEVEL;
  const id = localePrefix(level);
  const { root, colliders, reducedMotion } = context;
  const radii = level.definition.surfaceRadii;
  localeOverlay(
    root,
    level,
    `${id}-land`,
    [data.landPolygon],
    () => radii.ground,
    material(beacon ? PALETTE.sand : 0xc89b72, { roughness: 1 }),
  );
  const pad = Array.from({ length: 64 }, (_, i) => ({
    x: data.pad.center.x + Math.cos((i * Math.PI) / 32) * data.pad.radius,
    y: data.pad.center.y + Math.sin((i * Math.PI) / 32) * data.pad.radius,
  }));
  localeOverlay(
    root,
    level,
    `${id}-road`,
    [...Object.values(data.roads).map(road => road.polygon), pad],
    () => radii.road,
    material(PALETTE.road, { roughness: 0.96 }),
  );
  localeArrow(root, level, { x: -3.5, y: 0 }, { x: 1, y: 0 }, 0.6);
  localeArrow(root, level, { x: 0, y: -1.65 }, { x: 1, y: 0 }, 0.6);

  // All solid/decorative extents stay in the small landmark island, not the
  // causeway, fork, pad or outgoing connector. No invisible perimeter walls.
  const site = localeFrame(level, data.landmark.center, data.landmark.facing);
  site.name = beacon ? 'beacon-lighthouse' : 'depot-tool-shed';
  root.add(site);
  const cream = material(PALETTE.cream),
    wood = material(0x6b6155);
  const accent = material(beacon ? PALETTE.orange : 0xbf755f);
  if (beacon) {
    for (let i = 0; i < 5; i++)
      mesh(
        new THREE.CylinderGeometry(0.2 - i * 0.012, 0.212 - i * 0.012, 0.34, 10),
        i % 2 ? accent : cream,
        site,
        -0.24,
        0.17 + i * 0.34,
      );
    mesh(new THREE.ConeGeometry(0.25, 0.27, 10), wood, site, -0.24, 2.05);
  } else {
    for (const [x, y, z, size] of [
      [-0.32, 0.28, -0.12, 0.28],
      [-0.38, 0.16, 0.22, 0.18],
    ]) {
      const rock = mesh(new THREE.IcosahedronGeometry(size, 0), accent, site, x, y, z);
      rock.scale.y = 1.5;
    }
  }
  mesh(
    new THREE.BoxGeometry(0.46, beacon ? 0.55 : 0.65, 0.5),
    beacon ? cream : material(0xd5bf9d),
    site,
    0.23,
    beacon ? 0.275 : 0.325,
  );
  const roof = mesh(new THREE.BoxGeometry(0.54, 0.09, 0.58), accent, site, 0.23, beacon ? 0.59 : 0.69);
  roof.rotation.z = -0.1;
  mesh(new THREE.BoxGeometry(0.16, 0.34, 0.025), wood, site, 0.23, 0.17, 0.26);
  if (!beacon) {
    for (const x of [-0.19, 0.04]) {
      mesh(new THREE.BoxGeometry(0.18, 0.19, 0.18), material(0xe4b599), site, x, 0.095, -0.36);
      mesh(new THREE.BoxGeometry(0.025, 0.2, 0.19), cream, site, x, 0.095, -0.36);
    }
  }
  localePlaque(level, site, data.destination.label, 0.96, 0.16, 0.87, 0.27);

  const animation = new THREE.Group();
  animation.name = `${id}-animation`;
  site.add(animation);
  const lamp = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.18 }).clone();
  const light = mesh(
    new THREE.CylinderGeometry(beacon ? 0.18 : 0.075, beacon ? 0.18 : 0.075, beacon ? 0.23 : 0.13, 10),
    lamp,
    animation,
    beacon ? -0.24 : 0.42,
    beacon ? 1.81 : 0.52,
    beacon ? 0 : 0.28,
    false,
  );
  light.name = `${id}-lamp`;
  const recipient = new THREE.Group();
  recipient.name = `${id}-recipient`;
  recipient.position.set(0.03, 0.02, 0.43);
  animation.add(recipient);
  const skin = material(0xe7ad7b);
  mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.27, 7), beacon ? cream : accent, recipient, 0, 0.26);
  for (const x of [-0.065, 0.065]) mesh(new THREE.BoxGeometry(0.08, 0.12, 0.12), wood, recipient, x, 0.06);
  mesh(new THREE.SphereGeometry(0.12, 10, 8), skin, recipient, 0, 0.49);
  mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.065, 10), accent, recipient, 0, 0.59);
  for (const x of [-0.04, 0.04]) mesh(new THREE.SphereGeometry(0.015, 6, 5), wood, recipient, x, 0.51, 0.11, false);
  const arm = new THREE.Group();
  arm.name = `${id}-recipient-wave`;
  arm.position.set(-0.12, 0.34, 0);
  recipient.add(arm);
  mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.19, 6), accent, arm, -0.025, 0.07);
  mesh(new THREE.SphereGeometry(0.045, 8, 6), skin, arm, -0.025, 0.18);
  const parcel = new THREE.Group();
  parcel.name = `${id}-handoff-parcel`;
  animation.add(parcel);
  mesh(new THREE.BoxGeometry(0.2, 0.23, 0.18), material(data.destination.color), parcel);
  mesh(new THREE.BoxGeometry(0.035, 0.24, 0.19), cream, parcel);
  const reaction = new OutpostDeliveryReaction(
    animation,
    data.destination.id,
    data.reactionDuration,
    recipient,
    arm,
    parcel,
    lamp,
    reducedMotion,
  );
  colliders.push({
    normal: level.toNormal(data.landmark.center.x, data.landmark.center.y),
    radius: data.landmark.colliderRadius,
  });
  return { reaction, dynamicRoots: [animation] };
}
