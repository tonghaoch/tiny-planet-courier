import * as THREE from 'three';
import type { PrototypeId } from '../delivery-prototypes';
import type { DeliveryRun } from '../game';
import { headingTo, PLANET_RADIUS, tangent } from '../math';
import type { RoadRoute } from '../road-level';
import type { RouteCursor } from '../route-guidance';
import type { TourRouteCache } from '../tour-layout';
import type { TourSession } from '../tour-session';
import type { UI } from '../ui';
import type { Controls, Vehicle } from '../vehicle';
import type { PlanetWorld } from '../world';
import type { PlanetTestBridge, PlanetTestGuidance, PlanetTestHandoff } from './test-bridge-types';

interface TestBridgeObservation {
  readonly width: number;
  readonly height: number;
  readonly guidance: Omit<PlanetTestGuidance, 'mode' | 'commandedHeading' | 'displayedHeading' | 'arrival'> | null;
  readonly roadRoute: RoadRoute | null;
  readonly tourRoute: TourRouteCache | null;
  readonly tourNavigationPhase: 'transfer' | 'local';
  readonly handoffs: readonly PlanetTestHandoff[];
  readonly recentDriveEvents: readonly string[];
}

interface TestBridgeDependencies {
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly world: PlanetWorld;
  readonly vehicle: Vehicle;
  readonly ui: UI;
  readonly run: DeliveryRun | TourSession;
  readonly tour: TourSession | null;
  readonly prototypeId: PrototypeId | null;
  readonly clearControls: () => void;
  readonly setControls: (controls: Controls | null) => void;
  readonly resetNavigation: () => void;
  readonly refreshHUD: () => void;
  readonly observe: () => TestBridgeObservation;
}

export function installTestBridge({
  camera,
  renderer,
  scene,
  world,
  vehicle,
  ui,
  run,
  tour,
  prototypeId,
  clearControls,
  setControls,
  resetNavigation,
  refreshHUD,
  observe,
}: TestBridgeDependencies): void {
  const authoredPrototype = prototypeId !== null;
  const tourLayout = world.tourLayout;
  const roadLevel = tourLayout ? null : (world.stationLevel ?? world.gardenLevel);
  const compactCursor = (cursor?: RouteCursor | null) =>
    cursor ? { segment: cursor.segment, progress: cursor.progress } : null;
  const compactTourCache = (tourRoute: TourRouteCache | null) =>
    tourRoute
      ? {
          index: tourRoute.index,
          route: tourRoute.route,
          bayRoute: tourRoute.bayRoute,
          phase: tourRoute.phase,
          cursor: compactCursor(tourRoute.cursor),
          localCursor: compactCursor(tourRoute.localCursor),
        }
      : null;
  const recipientScreen = (id: string) => {
    const { width, height } = observe();
    const recipient = world.root.getObjectByName(`${id}-recipient`);
    if (!recipient) return null;
    const bounds = new THREE.Box3().setFromObject(recipient);
    const points = [bounds.min.x, bounds.max.x].flatMap(x =>
      [bounds.min.y, bounds.max.y].flatMap(y =>
        [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z).project(camera)),
      ),
    );
    const xs = points.map(p => (p.x * 0.5 + 0.5) * width);
    const ys = points.map(p => (-p.y * 0.5 + 0.5) * height);
    return {
      visible: recipient.visible && points.every(p => p.z > -1 && p.z < 1),
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  };
  const vehicleScreen = () => {
    const { width, height } = observe();
    // DEV-only observation of the rendered van, not a camera/controller input.
    // Project actual visible mesh vertices rather than an inflated world-axis box.
    const points: THREE.Vector3[] = [];
    vehicle.root.updateWorldMatrix(true, true);
    vehicle.root.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        points.push(
          new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera),
        );
      }
    });
    const xs = points.map(point => (point.x * 0.5 + 0.5) * width);
    const ys = points.map(point => (-point.y * 0.5 + 0.5) * height);
    return {
      visible: points.length > 0 && points.every(point => point.z > -1 && point.z < 1),
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  };
  const catalog = () =>
    tourLayout!.stops.map((stop, index) => ({
      index,
      id: stop.id,
      name: stop.destination.name,
      parcel: stop.destination.parcel,
      destination: stop.destination.normal.toArray(),
      entry: { normal: stop.entryPose.normal.toArray(), forward: stop.entryPose.forward.toArray() },
      pad: { normal: stop.deliveredPose.normal.toArray(), forward: stop.deliveredPose.forward.toArray() },
    }));
  const serializedPlan = () => ({ ...tour!.plan, order: [...tour!.plan.order] });
  // Explicit UI/state fixtures only; real-route acceptance never invokes these.
  const dockFixture = (index: number) => {
    const destination = world.destinations[index];
    if (!destination || !run.target || run.mode !== 'playing') return;
    clearControls();
    if (vehicle.drive) {
      vehicle.drive.reset();
      vehicle.drive.normal.copy(destination.normal);
      vehicle.drive.forward.copy(
        tourLayout?.stops[index]?.deliveredPose.forward ?? tangent(vehicle.drive.forward, vehicle.drive.normal),
      );
      vehicle.drive.contactRadius = vehicle.drive.environment.sampleSurface(vehicle.drive.normal).radius;
      vehicle.update(0, { throttle: 0, steer: 0, boost: false }, world.colliders);
    } else {
      vehicle.normal.copy(destination.normal);
      vehicle.forward.copy(tangent(vehicle.forward, vehicle.normal));
      vehicle.recover();
    }
  };
  Object.assign(window, {
    __planetTest: {
      snapshot: () => {
        const { guidance, roadRoute, tourRoute, tourNavigationPhase, handoffs, recentDriveEvents } = observe();
        const observedLocation = tour?.currentLocationId ?? tour?.completedLocationId;
        return {
          mode: run.mode,
          index: run.index,
          finished: run.finished,
          elapsed: run.elapsed,
          parkedFor: run.parkedFor,
          speed: vehicle.speed,
          charge: vehicle.charge,
          altitude: vehicle.altitude,
          normal: vehicle.normal.toArray(),
          forward: vehicle.forward.toArray(),
          vehicleScreen: vehicleScreen(),
          welcomeFrame: { ...ui.getWelcomeFrame() },
          cameraRadius: camera.position.length(),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          target: run.target?.normal.toArray(),
          heading: run.target ? headingTo(vehicle.normal, vehicle.forward, run.target.normal) : 0,
          prototype: authoredPrototype,
          prototypeId: prototypeId ?? 'standard',
          phase: vehicle.drive?.phase,
          recoveries: vehicle.drive?.recoveries,
          jumps: vehicle.drive?.jumps,
          landings: vehicle.drive?.landings,
          cargoVisible: vehicle.cargoVisible,
          cargoCount: vehicle.cargoCount,
          cargoPositions: vehicle.getCargoWorldPositions().map(point => point.toArray()),
          landingGuideVisible: vehicle.landingGuideVisible,
          local: (observedLocation ? tourLayout!.location(observedLocation).level : world.authoredLevel)?.toLocal(
            vehicle.normal,
          ),
          reaction: observedLocation
            ? world.getLocationReactionSnapshot(observedLocation)
            : authoredPrototype
              ? world.getDeliveryReactionSnapshot()
              : undefined,
          navigationTarget: guidance?.target?.slice(),
          route: tour ? tourRoute?.route : roadRoute,
          directDestinationHeading: guidance?.directDestinationHeading ?? null,
          hudHeading: ui.getNavigationPresentation().commandedHeading,
          displayedHeading: ui.getNavigationPresentation().displayedHeading,
          guidance: guidance
            ? {
                ...guidance,
                target: guidance.target?.slice() ?? null,
                normal: guidance.normal.slice(),
                forward: guidance.forward.slice(),
                cursor: guidance.cursor ? { ...guidance.cursor } : null,
                localCursor: guidance.localCursor ? { ...guidance.localCursor } : null,
                ...ui.getNavigationPresentation(),
              }
            : null,
          tour: tour
            ? {
                plan: serializedPlan(),
                recordKey: tour.recordKey,
                catalog: catalog(),
                currentLocationId: tour.currentLocationId ?? null,
                completedLocationId: tour.completedLocationId ?? null,
                splits: tour.splits,
                entryVisited: tour.entryVisited,
                currentStop: tour.currentStop?.id ?? null,
                checkpoint: {
                  legIndex: tour.checkpoint.legIndex,
                  stopId: tour.checkpoint.stopId,
                  kind: tour.checkpoint.kind,
                  label: tour.checkpoint.label,
                  pose: {
                    normal: tour.checkpoint.pose.normal.toArray(),
                    forward: tour.checkpoint.pose.forward.toArray(),
                  },
                },
                recoveryPose: {
                  normal: world.drivingEnvironment!.recoveryPose.normal.toArray(),
                  forward: world.drivingEnvironment!.recoveryPose.forward.toArray(),
                },
                navigationPhase: tourNavigationPhase,
                routeCache: compactTourCache(tourRoute),
                reactions: tourLayout!.stops.map(stop => world.getLocationReactionSnapshot(stop.id)),
                handoffs: handoffs.map(handoff => ({
                  ...handoff,
                  origin: handoff.origin.slice(),
                  normal: handoff.normal.slice(),
                  forward: handoff.forward.slice(),
                })),
                locals: tourLayout!.stops.map(stop => stop.level.toLocal(vehicle.normal)),
                recipientScreens: tourLayout!.stops.map(stop => recipientScreen(stop.id)),
                sceneObjects: (() => {
                  let count = 0;
                  scene.traverse(() => count++);
                  return count;
                })(),
              }
            : undefined,
          events: recentDriveEvents.slice(),
        };
      },
      routes: () =>
        tourLayout && tour
          ? {
              plan: serializedPlan(),
              recordKey: tour.recordKey,
              catalog: catalog(),
              legs: tour.plan.order.map((id, index) => {
                const stop = tourLayout.location(id);
                return {
                  index,
                  occurrenceId: tour.occurrenceId(index),
                  stopId: stop.id,
                  destination: stop.destination.normal.toArray(),
                  entry: { normal: stop.entryPose.normal.toArray(), forward: stop.entryPose.forward.toArray() },
                  pad: { normal: stop.deliveredPose.normal.toArray(), forward: stop.deliveredPose.forward.toArray() },
                  wide: tour.routeForLeg(index, 'wide').map(point => point.toArray()),
                  short: tour.routeForLeg(index, 'short').map(point => point.toArray()),
                };
              }),
              connectors: tourLayout.connectors.map(connector => ({
                from: connector.from,
                to: connector.to,
                width: connector.width,
                path: connector.path.map(point => point.toArray()),
              })),
              closing: tourLayout.connectors[2].path.map(point => point.toArray()),
              spawn: tourLayout.spawnPose.normal.toArray(),
            }
          : roadLevel
            ? {
                outer: roadLevel.outerRoute.map(point => point.toArray()),
                inner: roadLevel.innerRoute.map(point => point.toArray()),
                destination: world.destinations[0].normal.toArray(),
              }
            : world.bayLevel
              ? {
                  safe: world.bayLevel.safeRoute.map(point => point.toArray()),
                  jump: world.bayLevel.jumpRoute.map(point => point.toArray()),
                  destination: world.destinations[0].normal.toArray(),
                }
              : null,
      setControls: (controls: Controls | null) => {
        const finiteAxis = (value: number) => (Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0);
        setControls(
          controls
            ? {
                throttle: finiteAxis(controls.throttle),
                steer: finiteAxis(controls.steer),
                boost: Boolean(controls.boost),
              }
            : null,
        );
      },
      /** Explicit pose fixture for navigation/UI isolation, never route-driveability evidence. */
      setNavigationFixture: pose => {
        if (run.mode !== 'playing' || !run.target) return;
        clearControls();
        const level = tour?.currentStop?.level ?? world.authoredLevel;
        let normal: THREE.Vector3, forward: THREE.Vector3;
        if (pose.targetOffset !== undefined) {
          forward = tangent(vehicle.forward, run.target.normal);
          normal = run.target.normal
            .clone()
            .multiplyScalar(Math.cos(pose.targetOffset / PLANET_RADIUS))
            .addScaledVector(forward, Math.sin(pose.targetOffset / PLANET_RADIUS))
            .normalize();
          forward = tangent(forward, normal);
        } else {
          if (!level || pose.x === undefined || pose.y === undefined) return;
          normal = level.toNormal(pose.x, pose.y);
          forward = tangent(
            level.toNormal(pose.x + Math.cos(pose.heading ?? 0) * 0.01, pose.y + Math.sin(pose.heading ?? 0) * 0.01),
            normal,
          );
        }
        if (vehicle.drive) {
          vehicle.drive.reset();
          vehicle.drive.normal.copy(normal);
          vehicle.drive.forward.copy(forward);
          vehicle.drive.speed = pose.speed ?? 0;
          vehicle.drive.contactRadius = vehicle.drive.environment.sampleSurface(normal).radius;
          vehicle.update(0, { throttle: 0, steer: 0, boost: false }, world.colliders);
        } else {
          vehicle.normal.copy(normal);
          vehicle.forward.copy(forward);
          vehicle.speed = pose.speed ?? 0;
          vehicle.altitude = pose.altitude ?? 0;
        }
        if (pose.reset) resetNavigation();
        refreshHUD();
      },
      dockAtTarget: () =>
        dockFixture(
          tourLayout && tour ? tourLayout.stops.findIndex(stop => stop.id === tour.currentLocationId) : run.index,
        ),
      dockAtStop: (index: number) => {
        if (tourLayout && Number.isInteger(index)) dockFixture(index);
      },
      dockAtLocation: id => {
        if (tourLayout) dockFixture(tourLayout.stops.findIndex(stop => stop.id === id));
      },
    } satisfies PlanetTestBridge,
  });
}
