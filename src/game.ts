import { Vector3 } from 'three';
import { surfaceDistance, type Destination } from './math';

export type GameMode = 'home' | 'playing' | 'paused' | 'complete';
export interface DeliveryEvent {
  index: number;
  finished: boolean;
}
export const DELIVERY_RADIUS = 1.08;
export const DELIVERY_SPEED = 1.15;
export const DELIVERY_HOLD = 0.55;

export class DeliveryRun {
  mode: GameMode = 'home';
  index = 0;
  elapsed = 0;
  parkedFor = 0;

  constructor(
    readonly destinations: Destination[],
    readonly options: { keepDrivingOnFinish?: boolean } = {},
  ) {}

  start() {
    this.mode = 'playing';
    this.index = 0;
    this.elapsed = 0;
    this.parkedFor = 0;
  }

  pause() {
    if (this.mode === 'playing') this.mode = 'paused';
  }
  resume() {
    if (this.mode === 'paused') this.mode = 'playing';
  }
  home() {
    this.mode = 'home';
    this.parkedFor = 0;
  }
  get target(): Destination | undefined {
    return this.destinations[this.index];
  }
  get finished(): boolean {
    return this.destinations.length > 0 && this.index === this.destinations.length;
  }

  update(dt: number, normal: Vector3, speed: number, altitude = 0, grounded = true): DeliveryEvent | null {
    if (this.mode !== 'playing' || !this.target || !Number.isFinite(dt) || dt <= 0) return null;
    this.elapsed += dt;
    const canDeliver =
      grounded &&
      surfaceDistance(normal, this.target.normal) < DELIVERY_RADIUS &&
      Math.abs(speed) < DELIVERY_SPEED &&
      altitude < 0.2;
    this.parkedFor = canDeliver ? this.parkedFor + dt : 0;
    if (this.parkedFor < DELIVERY_HOLD) return null;
    const index = this.index++;
    this.parkedFor = 0;
    const finished = this.index === this.destinations.length;
    if (finished && !this.options.keepDrivingOnFinish) this.mode = 'complete';
    return { index, finished };
  }
}

export function formatTime(seconds: number, precise = false): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const remainder = Math.floor(safe % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${remainder}${precise ? '.' + Math.floor((safe % 1) * 10) : ''}`;
}

const RECORD_KEY = 'tiny-planet-courier:best:v1';
export const BAY_RECORD_KEY = 'tiny-planet-courier:bay-leap:best:v1';
export function readBest(key = RECORD_KEY): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveBest(time: number, key = RECORD_KEY): boolean {
  if (!Number.isFinite(time) || time <= 0) return false;
  const old = readBest(key);
  if (old !== null && time >= old) return false;
  try {
    localStorage.setItem(key, String(time));
    return true;
  } catch {
    return false;
  }
}
