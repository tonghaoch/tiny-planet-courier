import type { Vector3 } from 'three';
import type { Collider } from './math';

export interface SurfacePose {
  normal: Vector3;
  forward: Vector3;
}

export interface BaySurface {
  kind: 'ground' | 'road' | 'ramp' | 'water';
  /** Absolute radius of the visible contact surface. */
  radius: number;
  rampProgress?: number;
  rampSlope?: number;
  rampForward?: Vector3;
}

export interface RampCrossing {
  normal: Vector3;
  forward: Vector3;
  radius: number;
  pitch: number;
  /** Fraction of this surface movement before reaching the lip. */
  fraction: number;
}

export interface BayEnvironment {
  spawnPose: SurfacePose;
  recoveryPose: SurfacePose;
  colliders: Collider[];
  sampleSurface(normal: Vector3): BaySurface;
  crossRampLip(previous: Vector3, next: Vector3): RampCrossing | null;
}

export type BayPhase = 'grounded' | 'airborne' | 'recovering';

export interface BayDriveEvent {
  type: 'launch' | 'land' | 'splash' | 'recovered' | 'boost' | 'collision';
  normal: Vector3;
  strength: number;
}

export interface LandingPrediction {
  normal: Vector3;
  radius: number;
  kind: BaySurface['kind'];
  time: number;
}
