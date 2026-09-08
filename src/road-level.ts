import { Vector3 } from 'three';
import { AuthoredLevel, type AuthoredLevelDefinition, type LevelPoint } from './authored-level';
import { branchNavigation, type BranchNavigation, type NavigationContext } from './route-guidance';

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

  navigation(normal: Vector3, previous: RoadRoute | null, context: NavigationContext = {}): BranchNavigation<RoadRoute> {
    return branchNavigation(normal, previous, context,
      { inner: this.innerRoute, outer: this.outerRoute }, ['inner', 'outer'],
      this.toNormal(this.course.fork.x, this.course.fork.y), this.spawnPose.normal, this.destination.normal);
  }
}
