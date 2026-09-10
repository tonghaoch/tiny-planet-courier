import * as THREE from 'three';
import { PLANET_RADIUS as R, UP, type Collider } from '../math';

export interface LocaleSceneContext {
  root: THREE.Group;
  colliders: Collider[];
  reducedMotion: boolean;
}

export const PALETTE = {
  ocean: 0x387f8b,
  shallow: 0x70baa9,
  sand: 0xe4cf9f,
  grass: 0x88b99b,
  leaf: 0x568a76,
  darkLeaf: 0x326f62,
  road: 0xe8d9b8,
  orange: 0xf49869,
  cream: 0xffebcb,
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
export const material = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => {
  const key = JSON.stringify([color, extra]);
  let result = materials.get(key);
  if (!result) {
    result = new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true, ...extra });
    materials.set(key, result);
  }
  return result;
};
export const align = (normal: THREE.Vector3, altitude = R) => {
  const group = new THREE.Group();
  group.position.copy(normal).multiplyScalar(altitude);
  group.quaternion.setFromUnitVectors(UP, normal);
  return group;
};

export function mesh(
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(x, y, z);
  result.castShadow = shadow;
  result.receiveShadow = shadow;
  parent.add(result);
  return result;
}
