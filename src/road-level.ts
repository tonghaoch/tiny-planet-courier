import { Vector3 } from 'three';
import { AuthoredLevel, segmentDistance, type AuthoredLevelDefinition, type LevelPoint } from './authored-level';
import { surfaceDistance } from './math';

export type RoadRoute = 'outer' | 'inner';

export interface RoadLevelDefinition extends AuthoredLevelDefinition {
  readonly fork: LevelPoint;
  readonly outerRouteCenterline: readonly LevelPoint[];
  readonly innerRouteCenterline: readonly LevelPoint[];
}

/** Two authored ground paths with an eastward approach and a shared delivery pad. */
export class RoadLevel extends AuthoredLevel {
  readonly outerRoute: Vector3[];
  readonly innerRoute: Vector3[];

  constructor(private readonly course: RoadLevelDefinition) {
    super(course);
    this.outerRoute = this.route(course.outerRouteCenterline);
    this.innerRoute = this.route(course.innerRouteCenterline);
  }

  navigation(normal: Vector3, previous: RoadRoute | null): { route: RoadRoute | null; target: Vector3 } {
    const local = this.toLocal(normal);
    if (surfaceDistance(normal, this.destination.normal) < 2.3) return { route: previous, target: this.destination.normal };
    const distanceTo = (path: readonly LevelPoint[]) => Math.min(...path.slice(1).map((p, i) => segmentDistance(local, path[i], p)));
    const outerDistance = distanceTo(this.course.outerRouteCenterline), innerDistance = distanceTo(this.course.innerRouteCenterline);
    let choice = previous;
    if (local.x < this.course.fork.x - 0.4) choice = null;
    else if (outerDistance + 0.35 < innerDistance) choice = 'outer';
    else if (innerDistance + 0.35 < outerDistance) choice = 'inner';
    const route = choice === 'outer' ? this.outerRoute : this.innerRoute;
    let closest = 0, best = Infinity;
    route.forEach((p, i) => {
      const distance = surfaceDistance(normal, p);
      if (distance < best) { closest = i; best = distance; }
    });
    let ahead = Math.min(route.length - 1, closest + 1);
    while (ahead < route.length - 1 && surfaceDistance(normal, route[ahead]) < 1.8) ahead++;
    return { route: choice, target: route[ahead] };
  }
}
