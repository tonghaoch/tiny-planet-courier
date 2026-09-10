import type { BayRoute } from '../bay-level';
import type { BayPhase } from '../bay-types';
import type { PrototypeId } from '../delivery-prototypes';
import type { DeliveryRun } from '../game';
import type { GuidanceMode } from '../navigation-presentation';
import type { RoadRoute } from '../road-level';
import type { TourStopId } from '../tour-layout';
import type { TourSplit } from '../tour-session';
import type { Controls } from '../vehicle';
import type { DeliveryReactionSnapshot } from '../world';

export type PlanetTestControls = Controls;
export type PlanetTestVector = number[];
export interface PlanetTestPose {
  normal: PlanetTestVector;
  forward: PlanetTestVector;
}
export interface PlanetTestScreenRect {
  visible: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface PlanetTestCursor {
  segment: number;
  progress: number;
}
export interface PlanetTestRouteCache {
  index: number;
  route: RoadRoute | null;
  bayRoute: BayRoute | null | undefined;
  phase: 'transfer' | 'local' | undefined;
  cursor: PlanetTestCursor | null;
  localCursor: PlanetTestCursor | null;
}
export interface PlanetTestGuidance extends PlanetTestPose {
  sequence: number;
  target: PlanetTestVector | null;
  canonicalHeading: number | null;
  directDestinationHeading: number | null;
  distance: number;
  grounded: boolean;
  phase: 'transfer' | 'local';
  branch: RoadRoute | BayRoute | null;
  cursor: PlanetTestCursor | null;
  localCursor: PlanetTestCursor | null;
  mode: GuidanceMode;
  commandedHeading: number | null;
  displayedHeading: number | null;
  arrival: boolean;
}
export interface PlanetTestHandoff extends PlanetTestPose {
  index: number;
  origin: PlanetTestVector;
  speed: number;
  charge: number;
  remaining: number;
}
export interface PlanetTestTourSnapshot {
  splits: readonly TourSplit[];
  entryVisited: readonly boolean[];
  currentStop: TourStopId | null;
  checkpoint: { stopId: TourStopId; kind: 'entry' | 'pad'; label: string; pose: PlanetTestPose };
  recoveryPose: PlanetTestPose;
  navigationPhase: 'transfer' | 'local';
  routeCache: PlanetTestRouteCache | null;
  reactions: DeliveryReactionSnapshot[];
  handoffs: PlanetTestHandoff[];
  locals: { x: number; y: number }[];
  recipientScreens: (PlanetTestScreenRect | null)[];
  sceneObjects: number;
}

/** Serialized observations preserve the existing bridge's null and undefined values. */
export interface PlanetTestSnapshot extends PlanetTestPose {
  mode: DeliveryRun['mode'];
  index: number;
  finished: boolean;
  elapsed: number;
  parkedFor: number;
  speed: number;
  charge: number;
  altitude: number;
  vehicleScreen: PlanetTestScreenRect;
  welcomeFrame: { x: number; y: number; diameter: number };
  cameraRadius: number;
  drawCalls: number;
  triangles: number;
  target: PlanetTestVector | undefined;
  heading: number;
  prototype: boolean;
  prototypeId: PrototypeId | 'standard';
  phase: BayPhase | undefined;
  recoveries: number | undefined;
  jumps: number | undefined;
  landings: number | undefined;
  cargoVisible: boolean;
  cargoCount: number;
  cargoPositions: PlanetTestVector[];
  landingGuideVisible: boolean;
  local: { x: number; y: number } | undefined;
  reaction: DeliveryReactionSnapshot | undefined;
  navigationTarget: PlanetTestVector | undefined;
  route: RoadRoute | null | undefined;
  directDestinationHeading: number | null;
  hudHeading: number | null;
  displayedHeading: number | null;
  guidance: PlanetTestGuidance | null;
  tour: PlanetTestTourSnapshot | undefined;
  events: string[];
}
export interface PlanetTestBayRoutes {
  safe: PlanetTestVector[];
  jump: PlanetTestVector[];
  destination: PlanetTestVector;
}
export interface PlanetTestRoadRoutes {
  outer: PlanetTestVector[];
  inner: PlanetTestVector[];
  destination: PlanetTestVector;
}
export interface PlanetTestTourLeg {
  index: number;
  stopId: TourStopId;
  destination: PlanetTestVector;
  entry: PlanetTestPose;
  pad: PlanetTestPose;
  wide: PlanetTestVector[];
  short: PlanetTestVector[];
}
export interface PlanetTestTourRoutes {
  legs: PlanetTestTourLeg[];
  connectors: { from: number; to: number; width: number; path: PlanetTestVector[] }[];
  closing: PlanetTestVector[];
  spawn: PlanetTestVector;
}
export type PlanetTestRoutes = PlanetTestTourRoutes | PlanetTestRoadRoutes | PlanetTestBayRoutes | null;
export interface PlanetTestNavigationFixture {
  x?: number;
  y?: number;
  targetOffset?: number;
  heading?: number;
  speed?: number;
  altitude?: number;
  reset?: boolean;
}
export interface PlanetTestBridge {
  snapshot(): PlanetTestSnapshot;
  routes(): PlanetTestRoutes;
  setControls(controls: PlanetTestControls | null): void;
  setNavigationFixture(pose: PlanetTestNavigationFixture): void;
  dockAtTarget(): void;
  dockAtStop(index: number): void;
}

declare global {
  interface Window {
    __planetTest?: PlanetTestBridge;
  }
}
