import type { Vector3 } from 'three';
import { DeliveryRun, type DeliveryEvent } from './game';
import { surfaceDistance } from './math';
import type { SurfacePose } from './bay-types';
import { TourLayout, type TourStop, type TourStopId } from './tour-layout';

export const TOUR_RECORD_KEY = 'tiny-planet-courier:tour:best:v1';
export interface TourSplit { readonly stopId: TourStopId; readonly elapsed: number; readonly cumulative: number }
export interface TourCheckpoint {
  readonly stopId: TourStopId;
  readonly kind: 'entry' | 'pad';
  readonly label: string;
  readonly pose: SurfacePose;
}
const clonePose = (pose: SurfacePose): SurfacePose => ({ normal: pose.normal.clone(), forward: pose.forward.clone() });

/** DeliveryRun remains the sole authority for docking, active time, and finish policy. */
export class TourSession extends DeliveryRun {
  private readonly legSplits: TourSplit[] = [];
  private readonly visited: boolean[] = [true, false, false];
  private readonly safePoints: { entry: SurfacePose; pad: SurfacePose }[];
  private earnedCheckpoint: TourCheckpoint;

  constructor(readonly layout: TourLayout = new TourLayout()) {
    super(layout.destinations.map(d => ({ ...d, normal: d.normal.clone() })), { keepDrivingOnFinish: true });
    this.safePoints = layout.stops.map(stop => ({ entry: clonePose(stop.entryPose), pad: clonePose(stop.deliveredPose) }));
    this.earnedCheckpoint = this.checkpointAt(0, 'entry');
  }

  get splits(): readonly TourSplit[] { return this.legSplits.map(split => ({ ...split })); }
  get entryVisited(): readonly boolean[] { return [...this.visited]; }
  get currentStop(): TourStop | undefined { return this.layout.stops[this.index]; }
  get checkpoint(): TourCheckpoint { return { ...this.earnedCheckpoint, pose: clonePose(this.earnedCheckpoint.pose) }; }

  override start(): void {
    super.start();
    this.resetJourney();
  }

  /** Returning home abandons the journey; pause/resume and vehicle recovery do not. */
  override home(): void {
    super.start();
    super.home();
    this.resetJourney();
  }

  private resetJourney(): void {
    this.legSplits.length = 0;
    this.visited.splice(0, this.visited.length, true, false, false);
    this.earnedCheckpoint = this.checkpointAt(0, 'entry');
  }

  private checkpointAt(index: number, kind: 'entry' | 'pad'): TourCheckpoint {
    const stop = this.layout.stops[index];
    return {
      stopId: stop.id, kind, label: `${stop.destination.name} ${kind === 'entry' ? 'entrance' : 'delivery pad'}`,
      pose: clonePose(this.safePoints[index][kind]),
    };
  }

  /** Call with the actual vehicle location each frame, independently of delivery eligibility. */
  updateLocation(normal: Vector3, grounded: boolean): boolean {
    if (this.mode !== 'playing' || !grounded || !this.currentStop || this.visited[this.index]) return false;
    if (surfaceDistance(normal, this.safePoints[this.index].entry.normal) > 1.5) return false;
    this.visited[this.index] = true;
    this.earnedCheckpoint = this.checkpointAt(this.index, 'entry');
    return true;
  }

  override update(dt: number, normal: Vector3, speed: number, altitude = 0, grounded = true): DeliveryEvent | null {
    const event = super.update(dt, normal, speed, altitude, grounded);
    if (!event) return null;
    const previous = this.legSplits.at(-1)?.cumulative ?? 0;
    this.legSplits.push({ stopId: this.layout.stops[event.index].id, elapsed: this.elapsed - previous, cumulative: this.elapsed });
    this.earnedCheckpoint = this.checkpointAt(event.index, 'pad');
    return event;
  }
}
