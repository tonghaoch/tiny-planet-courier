import * as THREE from 'three';
import { BAY_LEVEL, BayLevel, inBayPolygon } from '../bay-level';
import { BayDeliveryReaction } from '../bay-reaction';
import { localeOverlay, localeFrame, localeArrow, localePlaque } from './locale-geometry';
import { PALETTE, material, mesh, type LocaleSceneContext } from './scenery-primitives';

export function buildBayScene(level: BayLevel, context: LocaleSceneContext) {
  const { root } = context;
  const radii = level.definition.surfaceRadii;
  const sand = new THREE.Color(0xead5a8),
    mint = new THREE.Color(PALETTE.grass);
  const shallow = new THREE.Color(0x8ad8ce),
    blue = new THREE.Color(0x479cae);
  localeOverlay(
    root,
    level,
    'bay-land',
    [BAY_LEVEL.landPolygon],
    () => radii.ground,
    material(0xffffff, { vertexColors: true, roughness: 1 }),
    p => {
      const coast = Math.min(1, level.distanceToShore(p.x, p.y) / 1.1);
      const color = sand.clone().lerp(mint, coast);
      const landing = BAY_LEVEL.landingRegion;
      if (p.x >= landing.minX && p.x <= landing.maxX && p.y >= landing.minY && p.y <= landing.maxY)
        color.lerp(new THREE.Color(0xb5d7b4), 0.65);
      return color;
    },
  );
  localeOverlay(
    root,
    level,
    'bay-water',
    [BAY_LEVEL.waterPolygon],
    () => radii.water,
    material(0xffffff, { vertexColors: true, roughness: 0.68, metalness: 0.02 }),
    p => shallow.clone().lerp(blue, Math.min(1, level.distanceToShore(p.x, p.y) / 0.85)),
  );
  const circle = Array.from({ length: 64 }, (_, i) => ({
    x: BAY_LEVEL.pad.center.x + Math.cos((i / 64) * Math.PI * 2) * BAY_LEVEL.pad.radius,
    y: BAY_LEVEL.pad.center.y + Math.sin((i / 64) * Math.PI * 2) * BAY_LEVEL.pad.radius,
  }));
  localeOverlay(
    root,
    level,
    'bay-road',
    [...Object.values(BAY_LEVEL.roads).map(road => road.polygon), circle],
    () => radii.road,
    material(PALETTE.road, { roughness: 0.96 }),
  );
  buildBayRamp(level, root);
  localeArrow(root, level, { x: -6, y: 1.2 }, { x: 0, y: 1 }, 0.82, 0x4d927c);
  localeArrow(root, level, { x: -5.45, y: 0 }, { x: 1, y: 0 }, 0.65);
  localeArrow(root, level, { x: -3.65, y: 0 }, { x: 1, y: 0 }, 0.9);
  localeArrow(root, level, { x: 5.8, y: 0 }, { x: 1, y: 0 }, 0.85, 0xfff2d5);

  const sign = localeFrame(level, { x: -6.15, y: -1.55 }, { x: -8, y: -1.55 });
  sign.name = 'bay-fork-sign';
  mesh(new THREE.BoxGeometry(0.1, 1.28, 0.1), material(0x866b51), sign, 0, 0.64);
  localePlaque(level, sign, 'SAFE ROAD', 1.12, 0.24, 1.19, 0.04, '#427760');
  localePlaque(level, sign, 'BAY JUMP', 1.12, 0.24, 0.83, 0.04, '#ad6245');
  // Non-text directional silhouettes survive the no-canvas fallback.
  for (const [height, color, angle] of [
    [1.19, 0x589880, Math.PI / 2],
    [0.83, PALETTE.orange, 0],
  ]) {
    const arrow = mesh(new THREE.ConeGeometry(0.13, 0.25, 3), material(color), sign, 0.73, height, 0.04);
    arrow.rotation.z = angle;
  }
  root.add(sign);

  // Small, bounded wave glints, all strictly inside the SAME sampled water polygon.
  const waveGeometry = new THREE.BoxGeometry(0.34, 0.008, 0.027);
  for (const p of [
    { x: -0.8, y: 1.2 },
    { x: 0.9, y: -0.3 },
    { x: -0.6, y: -1.6 },
    { x: 1.5, y: -3.2 },
    { x: -2, y: -4.5 },
  ]) {
    if (!inBayPolygon(p, BAY_LEVEL.waterPolygon)) continue;
    const wave = localeFrame(level, p, { x: p.x, y: p.y + 1 }, radii.water + 0.009);
    mesh(waveGeometry, material(0xc4eee0), wave, 0, 0, 0, false);
    mesh(waveGeometry, material(0xa0ded4), wave, 0.16, 0, 0.15, false).scale.x = 0.6;
    root.add(wave);
  }
  // Low landing chevrons sit OUTSIDE the usable 3.3 m-wide landing area.
  for (const x of [3.1, 4.8, 6.5])
    for (const y of [-1.84, 1.84]) {
      localeOverlay(
        root,
        level,
        'bay-landing-marker',
        [
          [
            { x: x - 0.13, y: y - 0.12 },
            { x: x + 0.13, y: y - 0.12 },
            { x: x + 0.13, y: y + 0.12 },
            { x: x - 0.13, y: y + 0.12 },
          ],
        ],
        () => radii.ground + 0.012,
        material(0xfff1cf),
      );
    }
  return buildBayBakery(level, context);
}

function buildBayRamp(level: BayLevel, root: THREE.Group) {
  const ramp = BAY_LEVEL.ramp;
  const vertices: number[] = [],
    indices: number[] = [];
  const rows = 24,
    columns = 8;
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const x = ramp.base.x + (ramp.length * row) / rows,
        y = ramp.base.y + ramp.width * (column / columns - 0.5);
      vertices.push(...level.toNormal(x, y).multiplyScalar(level.rampRadiusAt(x)).toArray());
      if (row < rows && column < columns) {
        const k = row * (columns + 1) + column;
        indices.push(k, k + columns + 1, k + 1, k + 1, k + columns + 1, k + columns + 2);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const deck = mesh(geometry, material(0xffe8b7, { roughness: 0.91 }), root, 0, 0, 0, false);
  deck.name = 'bay-ramp-deck';
  deck.receiveShadow = true;
  const sideVertices: number[] = [];
  const wall = (ax: number, ay: number, bx: number, by: number) => {
    const a = level.toNormal(ax, ay),
      b = level.toNormal(bx, by);
    const lowerA = a.clone().multiplyScalar(BAY_LEVEL.surfaceRadii.ground);
    const upperA = a.multiplyScalar(level.rampRadiusAt(ax));
    const lowerB = b.clone().multiplyScalar(BAY_LEVEL.surfaceRadii.ground);
    const upperB = b.multiplyScalar(level.rampRadiusAt(bx));
    for (const p of [lowerA, lowerB, upperA, upperA, lowerB, upperB]) sideVertices.push(...p.toArray());
  };
  for (let i = 0; i < rows; i++)
    for (const side of [-1, 1]) {
      wall(
        ramp.base.x + (ramp.length * i) / rows,
        (side * ramp.width) / 2,
        ramp.base.x + (ramp.length * (i + 1)) / rows,
        (side * ramp.width) / 2,
      );
    }
  // Visible launch face, never a physical wall: the sampler owns support/launch.
  for (let i = 0; i < columns; i++)
    wall(ramp.lip.x, ramp.width * (i / columns - 0.5), ramp.lip.x, ramp.width * ((i + 1) / columns - 0.5));
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(sideVertices, 3));
  sides.computeVertexNormals();
  mesh(sides, material(0xe88d5e, { side: THREE.DoubleSide }), root);
  for (const y of [-ramp.width / 2, ramp.width / 2 - 0.105]) {
    localeOverlay(
      root,
      level,
      'bay-ramp-edge',
      [
        [
          { x: ramp.base.x, y },
          { x: ramp.lip.x, y },
          { x: ramp.lip.x, y: y + 0.105 },
          { x: ramp.base.x, y: y + 0.105 },
        ],
      ],
      p => level.rampRadiusAt(p.x) + 0.008,
      material(PALETTE.orange),
    );
  }
  localeOverlay(
    root,
    level,
    'bay-ramp-lip',
    [
      [
        { x: ramp.lip.x - 0.1, y: -ramp.width / 2 },
        { x: ramp.lip.x, y: -ramp.width / 2 },
        { x: ramp.lip.x, y: ramp.width / 2 },
        { x: ramp.lip.x - 0.1, y: ramp.width / 2 },
      ],
    ],
    p => level.rampRadiusAt(p.x) + 0.012,
    material(0xffffff),
  );
}

function buildBayBakery(level: BayLevel, context: LocaleSceneContext) {
  const { root, colliders, reducedMotion } = context;
  const authored = BAY_LEVEL.bakery;
  const bakery = localeFrame(level, authored.center, authored.facing);
  bakery.name = 'bay-bakery';
  root.add(bakery);
  const wall = material(0xf2ce9c),
    trim = material(PALETTE.cream),
    wood = material(0x76604c);
  // An actual hollow doorway: side piers/header, back and side walls, not a solid box.
  mesh(new THREE.BoxGeometry(2.08, 1.52, 0.12), wall, bakery, 0, 0.78, -0.65);
  for (const x of [-0.99, 0.99]) mesh(new THREE.BoxGeometry(0.12, 1.52, 1.4), wall, bakery, x, 0.78, 0);
  for (const x of [-0.7, 0.7]) mesh(new THREE.BoxGeometry(0.69, 1.52, 0.13), wall, bakery, x, 0.78, 0.65);
  mesh(new THREE.BoxGeometry(0.72, 0.48, 0.13), wall, bakery, 0, 1.3, 0.65);
  mesh(new THREE.BoxGeometry(0.72, 1.06, 0.06), material(0x54473d), bakery, 0, 0.55, -0.34);
  mesh(new THREE.BoxGeometry(2.17, 0.1, 1.5), trim, bakery, 0, 0.01, 0);
  for (const x of [-0.35, 0.35]) mesh(new THREE.BoxGeometry(0.065, 1.06, 0.18), trim, bakery, x, 0.56, 0.71);
  mesh(new THREE.BoxGeometry(0.76, 0.08, 0.18), trim, bakery, 0, 1.07, 0.71);
  const roof = new THREE.Shape();
  roof.moveTo(-1.18, 0);
  roof.lineTo(1.18, 0);
  roof.lineTo(0, 0.67);
  roof.closePath();
  mesh(
    new THREE.ExtrudeGeometry(roof, { depth: 1.68, bevelEnabled: false }),
    material(0xc37e63),
    bakery,
    0,
    1.54,
    -0.84,
  );
  mesh(new THREE.BoxGeometry(0.25, 0.57, 0.25), trim, bakery, 0.65, 1.98, -0.33);
  const awning = mesh(new THREE.BoxGeometry(2.2, 0.085, 0.62), material(PALETTE.orange), bakery, 0, 1.2, 0.95);
  awning.rotation.x = 0.12;
  for (let i = -4; i <= 4; i++) {
    const stripe = mesh(new THREE.BoxGeometry(0.11, 0.09, 0.63), trim, bakery, i * 0.24, 1.2, 0.95, false);
    stripe.rotation.x = 0.12;
  }
  localePlaque(level, bakery, 'SUNRISE BAKERY', 1.68, 0.29, 1.58, 0.82);
  for (const x of [-0.8, 0.8]) {
    mesh(new THREE.BoxGeometry(0.32, 0.22, 0.29), material(0xb17f62), bakery, x, 0.13, 0.91);
    for (const dx of [-0.08, 0.08]) {
      mesh(new THREE.IcosahedronGeometry(0.15, 0), material(0x689775), bakery, x + dx, 0.32, 0.91);
      mesh(new THREE.IcosahedronGeometry(0.048, 0), material(0xffdf9b), bakery, x + dx, 0.44, 0.95, false);
    }
  }

  const animation = new THREE.Group();
  animation.name = 'bay-bakery-animation';
  bakery.add(animation);
  // The cache belongs to all houses; animate ONLY this clone, never the pooled material.
  const windowMaterial = material(0xffe5ac, { emissive: 0xffc56a, emissiveIntensity: 0.2 }).clone();
  for (const [i, x] of [-0.72, 0.72].entries()) {
    mesh(new THREE.BoxGeometry(0.43, 0.49, 0.065), trim, bakery, x, 0.78, 0.735);
    const window = mesh(new THREE.BoxGeometry(0.34, 0.39, 0.065), windowMaterial, animation, x, 0.78, 0.775, false);
    window.name = `bay-bakery-window-${i}`;
    mesh(new THREE.BoxGeometry(0.035, 0.4, 0.02), trim, bakery, x, 0.78, 0.814, false);
    mesh(new THREE.BoxGeometry(0.35, 0.035, 0.02), trim, bakery, x, 0.78, 0.814, false);
  }
  const hinge = new THREE.Group();
  hinge.name = 'bay-door-hinge';
  hinge.position.set(-0.31, 0.04, 0.73);
  animation.add(hinge);
  const door = mesh(new THREE.BoxGeometry(0.62, 0.97, 0.075), material(0x649783), hinge, 0.31, 0.485);
  door.name = 'bay-door';
  mesh(new THREE.BoxGeometry(0.4, 0.34, 0.025), trim, hinge, 0.31, 0.66, 0.048);
  mesh(new THREE.SphereGeometry(0.035, 8, 6), wood, hinge, 0.54, 0.43, 0.066);

  const recipient = new THREE.Group();
  recipient.name = 'bay-recipient';
  animation.add(recipient);
  const skin = material(0xe7ad7b),
    apron = material(0xffefd3);
  mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.36, 7), material(0xa0bf9b), recipient, 0, 0.36, 0);
  mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), apron, recipient, 0, 0.37, 0.15);
  for (const x of [-0.09, 0.09]) mesh(new THREE.BoxGeometry(0.1, 0.14, 0.17), wood, recipient, x, 0.09, 0.04);
  mesh(new THREE.SphereGeometry(0.17, 10, 8), skin, recipient, 0, 0.68);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.11, 10), apron, recipient, 0, 0.84);
  mesh(new THREE.IcosahedronGeometry(0.22, 1), apron, recipient, 0, 0.97).scale.set(1, 0.6, 0.8);
  for (const x of [-0.057, 0.057])
    mesh(new THREE.SphereGeometry(0.015, 6, 5), material(0x52473f), recipient, x, 0.7, 0.15, false);
  const arm = new THREE.Group();
  arm.name = 'bay-recipient-wave';
  arm.position.set(-0.16, 0.51, 0);
  recipient.add(arm);
  mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.26, 6), apron, arm, -0.045, 0.11);
  mesh(new THREE.SphereGeometry(0.061, 8, 6), skin, arm, -0.045, 0.27);
  const holdingArm = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 6), apron, recipient, 0.17, 0.43, 0.13);
  holdingArm.rotation.x = -0.95;

  const parcel = new THREE.Group();
  parcel.name = 'bay-handoff-parcel';
  animation.add(parcel);
  mesh(new THREE.BoxGeometry(0.32, 0.28, 0.27), material(0xdcb783), parcel);
  mesh(new THREE.BoxGeometry(0.045, 0.29, 0.28), trim, parcel);
  mesh(new THREE.BoxGeometry(0.33, 0.035, 0.28), trim, parcel);
  const reaction = new BayDeliveryReaction(animation, hinge, recipient, arm, parcel, windowMaterial, reducedMotion);
  colliders.push({
    normal: level.toNormal(authored.center.x, authored.center.y),
    radius: authored.colliderRadius,
  });
  return { reaction, dynamicRoots: [animation] };
}
