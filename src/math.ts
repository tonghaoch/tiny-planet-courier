import { Quaternion, Vector3 } from 'three';

export const PLANET_RADIUS = 15;
export const UP = new Vector3(0, 1, 0);
export const START_NORMAL = new Vector3(0, 0.5, Math.sqrt(0.75));
export const START_FORWARD = new Vector3(1, 0, 0);

export interface Destination {
  id: string;
  name: string;
  label: string;
  parcel: string;
  normal: Vector3;
  color: number;
}

export interface Collider {
  normal: Vector3;
  radius: number;
}

export function spherical(lat: number, lon: number): Vector3 {
  const a = lat * Math.PI / 180;
  const b = lon * Math.PI / 180;
  return new Vector3(Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b));
}

export function tangent(direction: Vector3, normal: Vector3): Vector3 {
  const result = direction.clone().addScaledVector(normal, -direction.dot(normal));
  if (result.lengthSq() < 1e-10) {
    const fallback = Math.abs(normal.y) < 0.9 ? UP : new Vector3(1, 0, 0);
    result.copy(fallback).addScaledVector(normal, -fallback.dot(normal));
  }
  return result.normalize();
}

export function surfaceDistance(a: Vector3, b: Vector3, radius = PLANET_RADIUS): number {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * radius;
}

export function advanceOnSphere(normal: Vector3, forward: Vector3, distance: number, radius = PLANET_RADIUS): void {
  const axis = new Vector3().crossVectors(normal, forward).normalize();
  if (axis.lengthSq() < 1e-10) return;
  const rotation = new Quaternion().setFromAxisAngle(axis, distance / radius);
  normal.applyQuaternion(rotation).normalize();
  forward.applyQuaternion(rotation).copy(tangent(forward, normal));
}

export function headingTo(normal: Vector3, forward: Vector3, target: Vector3): number {
  const toTarget = tangent(target, normal);
  const right = new Vector3().crossVectors(normal, forward).normalize();
  return Math.atan2(toTarget.dot(right), toTarget.dot(forward));
}

export function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
