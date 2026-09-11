import { installTestBridge } from './dev/test-bridge';
import { CameraRig } from './camera-rig';
import * as THREE from 'three';
import './style.css';
import { AudioFeedback } from './audio';
import type { BayDriveEvent } from './bay-types';
import { DeliveryRun, saveBest } from './game';
import { selectPrototype, selectTourSeed } from './delivery-prototypes';
import type { RoadRoute } from './road-level';
import type { BayRoute } from './bay-level';
import type { RouteCursor } from './route-guidance';
import { TourSession } from './tour-session';
import { createTourPlan } from './tour-itinerary';
import type { PlanetTestHandoff } from './dev/test-bridge-types';
import type { TourRouteCache } from './tour-layout';
import { Input } from './input';
import { headingTo, PLANET_RADIUS, surfaceDistance } from './math';
import { UI, type BayHUDState } from './ui';
import { Vehicle, type Controls } from './vehicle';
import { createSpace, PlanetWorld } from './world';

const parameters = new URLSearchParams(location.search);
const prototype = selectPrototype(location.search, import.meta.env.DEV);
const authoredPrototype = prototype !== null;
const ui = new UI(prototype);
ui.onAction = action => {
  if (action === 'reload') location.reload();
};

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Tiny Planet Courier 3D game view');
  renderer.domElement.tabIndex = -1;
  ui.stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 300);
  const ambient = new THREE.HemisphereLight(0xe0f0ef, 0x53776d, 2.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffe1ba, 3.6);
  sun.position.set(-15, 30, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -23;
  sun.shadow.camera.right = 23;
  sun.shadow.camera.top = 23;
  sun.shadow.camera.bottom = -23;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xa0cbd5, 1.8);
  rim.position.set(10, 5, -30);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc6a1, 0.8);
  fill.position.set(-20, -18, -5);
  scene.add(fill);
  const space = createSpace();
  scene.add(space);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = new PlanetWorld(prototype?.id ?? false, reducedMotion);
  const tourLayout = world.tourLayout;
  const roadLevel = tourLayout ? null : (world.stationLevel ?? world.gardenLevel);
  if (roadLevel) sun.position.copy(roadLevel.toNormal(-5, 8)).multiplyScalar(55);
  scene.add(world.root);
  const vehicle = new Vehicle(scene, world.drivingEnvironment, reducedMotion);
  const offeredPlan = () =>
    createTourPlan(selectTourSeed(import.meta.env.DEV ? location.search : '', import.meta.env.DEV));
  const tour = tourLayout ? new TourSession(tourLayout, offeredPlan()) : null;
  const run = tour ?? new DeliveryRun(world.destinations, { keepDrivingOnFinish: authoredPrototype });
  if (tour) {
    vehicle.setCargoCapacity(10);
    world.setTourRecoveryPose(tour.checkpoint.pose);
  }
  const sound = new AudioFeedback();
  ui.setDestinations(run.destinations);
  activateTarget();

  function activateTarget() {
    if (tour) world.setActiveLocation(tour.currentLocationId ?? null);
    else world.setActiveDestination(run.index);
  }

  const cameraRig = new CameraRig(camera, prototype?.id ?? null, reducedMotion);
  let width = window.innerWidth;
  let height = window.innerHeight;
  let elapsed = 0;
  let accumulator = 0;
  let last = performance.now();
  let uiClock = 0;
  let resultDelay = 0;
  let pendingResult: { time: number; newRecord: boolean } | null = null;
  let roadRoute: RoadRoute | null = null;
  let bayRoute: BayRoute | null = null;
  let routeCursor: RouteCursor | null = null;
  const compactCursor = (cursor?: RouteCursor | null) =>
    cursor ? { segment: cursor.segment, progress: cursor.progress } : null;
  let guidanceSequence = 0;
  let guidance: {
    sequence: number;
    target: number[] | null;
    canonicalHeading: number | null;
    directDestinationHeading: number | null;
    distance: number;
    grounded: boolean;
    normal: number[];
    forward: number[];
    phase: 'transfer' | 'local';
    branch: RoadRoute | BayRoute | null;
    cursor: ReturnType<typeof compactCursor>;
    localCursor: ReturnType<typeof compactCursor>;
  } | null = null;
  let tourRoute: TourRouteCache | null = null;
  let tourNavigationPhase: 'transfer' | 'local' = 'local';
  const handoffs: PlanetTestHandoff[] = [];
  let testControls: Controls | null = null;
  const recentDriveEvents: string[] = [];

  const input = new Input(
    () => run.mode === 'playing',
    togglePause,
    () => {
      input.clear();
      testControls = null;
      vehicle.recover();
      resetNavigation();
      if (!authoredPrototype) ui.toast('Van recovered. Ready to roll.');
    },
  );

  function resetNavigation() {
    roadRoute = null;
    bayRoute = null;
    routeCursor = null;
    tourRoute = null;
    guidance = null;
    ui.resetNavigationPresentation();
    tourNavigationPhase = 'local';
  }

  function syncTourCheckpoint() {
    if (!tour) return;
    world.setTourRecoveryPose(tour.checkpoint.pose);
    resetNavigation();
  }

  function start() {
    const replay = run.mode !== 'home';
    input.clear();
    testControls = null;
    run.start();
    syncTourCheckpoint();
    vehicle.reset();
    world.resetDelivery();
    activateTarget();
    pendingResult = null;
    resetNavigation();
    handoffs.length = 0;
    resultDelay = 0;
    cameraRig.start(replay);
    recentDriveEvents.length = 0;
    ui.resetJourney();
    sound.setPaused(false);
    sound.unlock();
    ui.setMode('playing');
    renderer.domElement.focus({ preventScroll: true });
    ui.toast(prototype?.hints.start ?? 'WASD to drive · Park in the glow to deliver');
    accumulator = 0;
    updateHUD();
  }

  function togglePause() {
    if (run.mode === 'playing') run.pause();
    else if (run.mode === 'paused') {
      run.resume();
      renderer.domElement.focus({ preventScroll: true });
    }
    input.clear();
    testControls = null;
    sound.setPaused(run.mode === 'paused');
    ui.setMode(run.mode);
  }

  ui.onAction = action => {
    if (action === 'start' || action === 'restart') start();
    else if (action === 'pause' || action === 'resume') togglePause();
    else if (action === 'sound') {
      ui.setSound(sound.toggle());
      if (run.mode === 'playing') renderer.domElement.focus({ preventScroll: true });
    } else if (action === 'home') {
      input.clear();
      testControls = null;
      run.home();
      if (tour) {
        tour.startPlan(offeredPlan());
        tour.home();
      }
      syncTourCheckpoint();
      vehicle.reset();
      world.resetDelivery();
      activateTarget();
      pendingResult = null;
      resetNavigation();
      handoffs.length = 0;
      recentDriveEvents.length = 0;
      resultDelay = 0;
      ui.resetJourney();
      ui.setDestinations(run.destinations);
      sound.setPaused(true);
      ui.setMode('home');
    } else if (action === 'reload') location.reload();
  };

  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  window.addEventListener('pagehide', () => sound.dispose());

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    input.clear();
    testControls = null;
    run.pause();
    sound.setPaused(true);
    ui.showError('Your browser lost its 3D graphics connection. Close other graphics-heavy tabs, then reload.');
    renderer.setAnimationLoop(null);
  });

  function handleDriveEvents(events: BayDriveEvent[]) {
    for (const event of events) {
      sound.handle(event);
      recentDriveEvents.push(event.type);
      if (recentDriveEvents.length > 32) recentDriveEvents.shift();
      if (event.type === 'splash') {
        world.splash(event.normal);
        ui.toast('A splash, not a setback. Your parcel is safe.');
      } else if (event.type === 'recovered') {
        input.clear();
        testControls = null;
        cameraRig.recovered();
        resetNavigation();
        ui.toast(
          tour
            ? `Back at ${tour.checkpoint.label}. Your deliveries are safe.`
            : (prototype?.hints.recovery ?? 'Van recovered. Ready to roll.'),
        );
      } else if (
        event.type === 'land' &&
        !run.finished &&
        world.bayLevel &&
        world.bayLevel.toLocal(event.normal).x > 0
      ) {
        ui.toast('Across the bay! Brake for the bakery.');
      }
    }
  }

  function presentationGrounded() {
    return vehicle.drive ? vehicle.drive.phase === 'grounded' : vehicle.altitude === 0;
  }

  /** Road context only: selection updates hints/caches, never the compass target.
   * The returned bearing is solely for the Tour's reverse-to-exit road hint. */
  function updateRouteContext(): number | null {
    if (!run.target) return null;
    const grounded = presentationGrounded();
    if (tour) {
      const navigation = tour.navigation(vehicle.normal, tourRoute, grounded, vehicle.forward);
      tourRoute = navigation.route;
      tourNavigationPhase = navigation.phase;
      return surfaceDistance(vehicle.normal, navigation.target) > 1e-6
        ? headingTo(vehicle.normal, vehicle.forward, navigation.target)
        : null;
    }
    const context = { forward: vehicle.forward, cursor: routeCursor, grounded };
    if (roadLevel) {
      const navigation = roadLevel.navigation(vehicle.normal, roadRoute, context);
      roadRoute = navigation.route;
      routeCursor = navigation.cursor;
    } else if (world.bayLevel) {
      const navigation = world.bayLevel.navigation(vehicle.normal, bayRoute, context);
      bayRoute = navigation.route;
      routeCursor = navigation.cursor;
    }
    return null;
  }

  function updateMarker() {
    const target = run.target;
    if (run.mode !== 'playing' || !target) {
      ui.marker.hidden = true;
      return;
    }
    const worldPoint = target.normal.clone().multiplyScalar(PLANET_RADIUS + 2.9);
    const projected = worldPoint.clone().project(camera);
    const facing =
      target.normal.dot(camera.position.clone().sub(target.normal.clone().multiplyScalar(PLANET_RADIUS))) > 0;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible =
      facing &&
      projected.z > -1 &&
      projected.z < 1 &&
      x > 80 &&
      x < width - 80 &&
      y > 105 &&
      y < height - 120 &&
      ui.canShowTargetLabel(x, y);
    ui.marker.hidden = !visible;
    if (visible) {
      ui.marker.style.left = `${x}px`;
      ui.marker.style.top = `${y}px`;
    }
  }

  function updateHUD() {
    const destination = run.target;
    const distance = destination ? surfaceDistance(vehicle.normal, destination.normal) : 0;
    const roadExitHeading = updateRouteContext();
    // The compass always points to the active delivery, not a road lookahead.
    // A coincident destination has no meaningful tangent bearing; never invent one.
    const canonicalHeading =
      destination && distance > 1e-6 ? headingTo(vehicle.normal, vehicle.forward, destination.normal) : null;
    const grounded = presentationGrounded();
    let bayState: BayHUDState = {
      phase: vehicle.drive?.phase ?? (grounded ? 'grounded' : 'airborne'),
      grounded,
      onRamp: false,
      onCoastalRoad: false,
      nearDestination: distance < 2.6,
    };
    const stop = tour?.currentStop;
    const level = stop?.level ?? (tour ? null : world.authoredLevel);
    if (vehicle.drive && level) {
      const surface = tourLayout ? tourLayout.sampleSurface(vehicle.normal) : level.sampleSurface(vehicle.normal);
      const isBay = tour ? stop?.id === 'bay' : !!world.bayLevel;
      bayState = {
        phase: vehicle.drive.phase,
        grounded,
        onRamp: surface.kind === 'ramp',
        onCoastalRoad: isBay && (tour ? tourRoute?.bayRoute : bayRoute) === 'coast',
        nearDestination: distance < (isBay ? 6.5 : 2.6),
        route: tour ? tourRoute?.route : roadRoute,
        stopId: stop?.id,
        navigationPhase: tour ? tourNavigationPhase : undefined,
        checkpointLabel: tour?.checkpoint.label,
        reverseToExit:
          !!tour &&
          tour.checkpoint.kind === 'pad' &&
          Math.abs(vehicle.speed) < 0.8 &&
          surfaceDistance(vehicle.normal, tour.checkpoint.pose.normal) < 2.5 &&
          roadExitHeading !== null &&
          Math.abs(roadExitHeading) > Math.PI / 2,
      };
    }
    ui.update(run, vehicle.speed, vehicle.charge, distance, canonicalHeading, bayState);
    guidance = {
      sequence: ++guidanceSequence,
      target: destination?.normal.toArray() ?? null,
      canonicalHeading,
      directDestinationHeading: canonicalHeading,
      distance,
      grounded,
      normal: vehicle.normal.toArray(),
      forward: vehicle.forward.toArray(),
      phase: tourNavigationPhase,
      branch: tour ? (tourRoute?.bayRoute ?? tourRoute?.route ?? null) : (bayRoute ?? roadRoute),
      cursor: compactCursor(tour ? tourRoute?.cursor : routeCursor),
      localCursor: compactCursor(tourRoute?.localCursor),
    };
    ui.setSound(sound.enabled);
  }

  renderer.setAnimationLoop(now => {
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.08);
    last = now;
    elapsed += dt;
    if (run.mode === 'playing') {
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        const controls = import.meta.env.DEV && testControls ? testControls : input.controls;
        const step = 1 / 120;
        handleDriveEvents(vehicle.update(step, controls, world.colliders));
        const grounded = !vehicle.drive || vehicle.drive.phase === 'grounded';
        if (tour?.updateLocation(vehicle.normal, grounded)) syncTourCheckpoint();
        const delivery = run.update(
          step,
          vehicle.normal,
          vehicle.speed,
          vehicle.drive ? 0 : vehicle.altitude,
          grounded,
        );
        if (delivery) {
          resetNavigation();
          const destination = run.destinations[delivery.index];
          world.celebrate(destination.normal);
          activateTarget();
          sound.chime(delivery.finished);
          if (tour) {
            // A handoff changes only journey/cargo/reaction state, never the driving state.
            vehicle.syncVisual(0, elapsed);
            const origin = vehicle.consumeParcel();
            if (origin) {
              const locationId = tour.plan.order[delivery.index];
              world.startLocationDelivery(origin, locationId);
              if (import.meta.env.DEV)
                handoffs.push({
                  index: delivery.index,
                  occurrenceId: tour.occurrenceId(delivery.index),
                  locationId,
                  origin: origin.toArray(),
                  normal: vehicle.normal.toArray(),
                  forward: vehicle.forward.toArray(),
                  speed: vehicle.speed,
                  charge: vehicle.charge,
                  remaining: vehicle.cargoCount,
                });
            }
            syncTourCheckpoint();
            updateHUD();
            if (delivery.finished)
              ui.showTourResults(tour.elapsed, tour.splits, saveBest(tour.elapsed, tour.recordKey), tour.recordKey);
            else ui.toast(`Delivered to ${destination.name}! Follow the connecting road to ${run.target!.name}.`);
          } else if (prototype && prototype.id !== 'tour' && delivery.finished) {
            vehicle.syncVisual(0, elapsed);
            const parcelStart = vehicle.getParcelWorldPosition();
            vehicle.setCargoVisible(false);
            world.startDelivery(parcelStart, delivery.index);
            pendingResult = { time: run.elapsed, newRecord: saveBest(run.elapsed, prototype.bestScoreKey) };
            resultDelay = 1.15;
          } else if (delivery.finished) {
            vehicle.speed = 0;
            input.clear();
            testControls = null;
            ui.showResults(run.elapsed, saveBest(run.elapsed));
          } else ui.toast(`Delivered to ${destination.name}! Next stop: ${run.target!.name}.`);
        }
        accumulator -= step;
        if (run.mode !== 'playing') {
          accumulator = 0;
          break;
        }
      }
      if (pendingResult) {
        resultDelay -= dt;
        if (resultDelay <= 0) {
          ui.showBayResults(pendingResult.time, pendingResult.newRecord);
          pendingResult = null;
        }
      }
    } else accumulator = 0;
    sound.setPaused(run.mode === 'paused' || document.hidden);
    if (vehicle.drive)
      sound.updateDrive({
        speed: vehicle.speed,
        boosting: vehicle.boosting,
        phase: vehicle.drive.phase,
        active: run.mode === 'playing',
      });
    vehicle.syncVisual(run.mode === 'paused' ? 0 : dt, elapsed);
    world.update(dt, elapsed, run.mode === 'paused');
    const portrait = width / height < 0.94;
    space.children.forEach(child => {
      if (!(child instanceof THREE.Points)) child.visible = !portrait;
    });
    cameraRig.update({
      dt,
      elapsed,
      mode: run.mode,
      finished: run.finished,
      vehicle: {
        normal: vehicle.normal,
        forward: vehicle.forward,
        altitude: vehicle.altitude,
        boosting: vehicle.boosting,
        phase: vehicle.drive?.phase,
      },
      viewport: { width, height },
      welcomeFrame: ui.getWelcomeFrame(),
    });
    renderer.render(scene, camera);
    updateMarker();
    uiClock += dt;
    if (
      uiClock > 0.06 ||
      !guidance ||
      (vehicle.drive?.phase === 'recovering') !== (ui.getNavigationPresentation().mode === 'recovering')
    ) {
      uiClock = 0;
      updateHUD();
    }
    ui.advanceNavigation(run.mode === 'paused' ? 0 : dt);
    ui.app.dataset.ready = 'true';
  });

  // Local browser checks use real fixed-step driving; these controls never ship in production.
  if (import.meta.env.DEV && parameters.has('test')) {
    installTestBridge({
      camera,
      renderer,
      scene,
      world,
      vehicle,
      ui,
      run,
      tour,
      prototypeId: prototype?.id ?? null,
      clearControls: () => {
        input.clear();
        testControls = null;
      },
      setControls: controls => {
        testControls = controls;
      },
      resetNavigation,
      refreshHUD: updateHUD,
      observe: () => ({
        width,
        height,
        guidance,
        roadRoute,
        tourRoute,
        tourNavigationPhase,
        handoffs,
        recentDriveEvents,
      }),
    });
  }
} catch (error) {
  console.error('Unable to initialize tiny planet:', error);
  ui.showError(
    'Use an up-to-date version of Edge, Chrome, Firefox, or Safari with WebGL 2 support, and enable hardware acceleration in your browser settings. If the game still cannot start, try updating your graphics driver.',
  );
}
