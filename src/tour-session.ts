import type { Vector3 } from 'three';
import { DeliveryRun, type DeliveryEvent } from './game';
import { surfaceDistance, tangent } from './math';
import type { SurfacePose } from './bay-types';
import { TourLayout, type TourStop, type TourStopId, type TourRouteCache } from './tour-layout';
import { copyTourPlan, createTourPlan, tourRecordKey, type TourPlan } from './tour-itinerary';

/** Legacy three-stop records are deliberately untouched. Use session.recordKey for new runs. */
export const TOUR_RECORD_KEY = 'tiny-planet-courier:tour:best:v1';
export interface TourSplit {
  readonly index: number;
  readonly occurrenceId: string;
  readonly stopId: TourStopId;
  readonly elapsed: number;
  readonly cumulative: number;
}
export interface TourDeliveryEvent extends DeliveryEvent {
  readonly locationId: TourStopId;
  readonly occurrenceId: string;
}
export interface TourCheckpoint {
  readonly stopId: TourStopId;
  readonly legIndex: number;
  readonly kind: 'entry' | 'pad';
  readonly label: string;
  readonly pose: SurfacePose;
}
const clonePose = (pose: SurfacePose): SurfacePose => ({ normal: pose.normal.clone(), forward: pose.forward.clone() });

/** DeliveryRun remains the sole authority for docking, active time, and finish policy. */
export class TourSession extends DeliveryRun {
  private readonly legSplits: TourSplit[] = [];
  private readonly visited: boolean[];
  private readonly safePoints: { entry: SurfacePose; pad: SurfacePose }[];
  private earnedCheckpoint: TourCheckpoint;
  private itinerary: TourPlan;

  constructor(
    readonly layout: TourLayout = new TourLayout(),
    plan: TourPlan = createTourPlan(0),
  ) {
    const owned = copyTourPlan(plan);
    super(
      owned.order.map(id => {
        const d = layout.location(id).destination;
        return { ...d, normal: d.normal.clone() };
      }),
      { keepDrivingOnFinish: true },
    );
    this.itinerary = owned;
    this.safePoints = layout.stops.map(stop => ({
      entry: clonePose(stop.entryPose),
      pad: clonePose(stop.deliveredPose),
    }));
    this.visited = layout.stops.map(stop => stop.id === 'bay');
    this.earnedCheckpoint = this.checkpointAt('bay', 'entry');
  }

  get plan(): TourPlan {
    return this.itinerary;
  }
  get recordKey(): string {
    return tourRecordKey(this.plan);
  }
  get splits(): readonly TourSplit[] {
    return this.legSplits.map(split => ({ ...split }));
  }
  /** Entrance visits in this leg only, indexed by the five-site physical catalog. */
  get entryVisited(): readonly boolean[] {
    return [...this.visited];
  }
  get currentLocationId(): TourStopId | undefined {
    return this.plan.order[this.index];
  }
  get completedLocationId(): TourStopId | undefined {
    return this.legSplits.at(-1)?.stopId;
  }
  get currentStop(): TourStop | undefined {
    return this.currentLocationId ? this.layout.location(this.currentLocationId) : undefined;
  }
  get checkpoint(): TourCheckpoint {
    return { ...this.earnedCheckpoint, pose: clonePose(this.earnedCheckpoint.pose) };
  }

  occurrenceId(index: number): string {
    if (!Number.isInteger(index) || !this.plan.order[index]) throw new RangeError('Invalid Tour occurrence');
    return `${this.recordKey}:${index}`;
  }

  routeForLeg(index: number, variant: 'wide' | 'short'): Vector3[] {
    return this.layout.routeForLeg(index, variant, this.plan);
  }

  navigation(normal: Vector3, previous: TourRouteCache | null, grounded: boolean, forward?: Vector3) {
    return this.layout.navigation(this.index, normal, previous, grounded, { forward }, this.plan);
  }

  /** Restart never reshuffles. New-plan selection and persistence belong to the caller. */
  override start(): void {
    super.start();
    this.resetJourney();
  }
  restart(): void {
    this.start();
  }
  newTour(seed: number): void {
    this.startPlan(createTourPlan(seed));
  }
  startPlan(plan: TourPlan): void {
    const owned = copyTourPlan(plan);
    this.itinerary = owned;
    this.destinations.splice(
      0,
      this.destinations.length,
      ...owned.order.map(id => {
        const d = this.layout.location(id).destination;
        return { ...d, normal: d.normal.clone() };
      }),
    );
    this.start();
  }

  /** Returning home abandons progress, not the immutable plan; the next New Tour is explicit. */
  override home(): void {
    super.start();
    super.home();
    this.resetJourney();
  }

  private resetJourney(): void {
    this.legSplits.length = 0;
    this.visited.splice(0, this.visited.length, ...this.layout.stops.map(stop => stop.id === 'bay'));
    this.earnedCheckpoint = this.checkpointAt('bay', 'entry');
  }

  private checkpointAt(id: TourStopId, kind: 'entry' | 'pad'): TourCheckpoint {
    const stop = this.layout.location(id);
    const pose = clonePose(this.safePoints[this.layout.stops.indexOf(stop)][kind]);
    if (kind === 'pad' && this.currentLocationId && this.currentLocationId !== id) {
      const outgoing = this.layout.routeBetween(id, this.currentLocationId, 'wide');
      pose.forward = tangent(outgoing[1], pose.normal);
    }
    return {
      stopId: id,
      legIndex: this.index,
      kind,
      label: `${stop.destination.name} ${kind === 'entry' ? 'entrance' : 'delivery pad'}`,
      pose,
    };
  }

  /** Grounded transit entrances count too, but no previous leg remotely unlocks an entrance. */
  updateLocation(normal: Vector3, grounded: boolean): boolean {
    if (this.mode !== 'playing' || !grounded || !this.currentStop) return false;
    const index = this.safePoints.findIndex(
      (safe, i) => !this.visited[i] && surfaceDistance(normal, safe.entry.normal) <= 1.5,
    );
    if (index < 0) return false;
    this.visited[index] = true;
    this.earnedCheckpoint = this.checkpointAt(this.layout.stops[index].id, 'entry');
    return true;
  }

  override update(dt: number, normal: Vector3, speed: number, altitude = 0, grounded = true): TourDeliveryEvent | null {
    const event = super.update(dt, normal, speed, altitude, grounded);
    if (!event) return null;
    const id = this.plan.order[event.index];
    const previous = this.legSplits.at(-1)?.cumulative ?? 0;
    const occurrenceId = this.occurrenceId(event.index);
    this.legSplits.push({
      index: event.index,
      occurrenceId,
      stopId: id,
      elapsed: this.elapsed - previous,
      cumulative: this.elapsed,
    });
    this.visited.fill(false);
    this.earnedCheckpoint = this.checkpointAt(id, 'pad');
    return { ...event, locationId: id, occurrenceId };
  }
}
