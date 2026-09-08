import * as THREE from 'three';
import './style.css';
import { AudioFeedback } from './audio';
import type { BayDriveEvent } from './bay-types';
import { DeliveryRun, saveBest } from './game';
import { selectPrototype } from './delivery-prototypes';
import type { RoadRoute } from './road-level';
import type { BayRoute } from './bay-level';
import type { RouteCursor } from './route-guidance';
import { TourSession, TOUR_RECORD_KEY } from './tour-session';
import type { TourRouteCache } from './tour-layout';
import { Input } from './input';
import { headingTo, PLANET_RADIUS, spherical, surfaceDistance, tangent, UP } from './math';
import { UI, type BayHUDState } from './ui';
import { Vehicle, type Controls } from './vehicle';
import { createSpace, PlanetWorld } from './world';

const parameters = new URLSearchParams(location.search);
const prototype = selectPrototype(location.search, import.meta.env.DEV);
const authoredPrototype = prototype !== null;
const bayPrototype = prototype?.id === 'bay';
const ui = new UI(prototype);
ui.onAction = action => { if (action === 'reload') location.reload(); };

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
  sun.shadow.camera.left = -23; sun.shadow.camera.right = 23;
  sun.shadow.camera.top = 23; sun.shadow.camera.bottom = -23;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
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
  const roadLevel = tourLayout ? null : world.stationLevel ?? world.gardenLevel;
  if (roadLevel) sun.position.copy(roadLevel.toNormal(-5, 8)).multiplyScalar(55);
  scene.add(world.root);
  const vehicle = new Vehicle(scene, world.drivingEnvironment, reducedMotion);
  const tour = tourLayout ? new TourSession(tourLayout) : null;
  const run = tour ?? new DeliveryRun(world.destinations, { keepDrivingOnFinish: authoredPrototype });
  if (tour) {
    vehicle.setCargoCapacity(3);
    world.setTourRecoveryPose(tour.checkpoint.pose);
  }
  const sound = new AudioFeedback();
  ui.setDestinations(world.destinations);
  world.setActiveDestination(0);

  const lookTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  let homeBlend = 1;
  let airBlend = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let firstFrame = true;
  let elapsed = 0;
  let accumulator = 0;
  let last = performance.now();
  let uiClock = 0;
  let resultDelay = 0;
  let pendingResult: { time: number; newRecord: boolean } | null = null;
  let roadRoute: RoadRoute | null = null;
  let bayRoute: BayRoute | null = null;
  let routeCursor: RouteCursor | null = null;
  const compactCursor = (cursor?: RouteCursor | null) => cursor ? { segment: cursor.segment, progress: cursor.progress } : null;
  const compactTourCache = () => tourRoute ? { index: tourRoute.index, route: tourRoute.route,
    bayRoute: tourRoute.bayRoute, phase: tourRoute.phase,
    cursor: compactCursor(tourRoute.cursor), localCursor: compactCursor(tourRoute.localCursor) } : null;
  let guidanceSequence = 0;
  let guidance: { sequence: number; target: number[] | null; canonicalHeading: number | null;
    directDestinationHeading: number | null; distance: number; grounded: boolean; normal: number[]; forward: number[];
    phase: 'transfer' | 'local'; branch: RoadRoute | BayRoute | null;
    cursor: ReturnType<typeof compactCursor>; localCursor: ReturnType<typeof compactCursor> } | null = null;
  let tourRoute: TourRouteCache | null = null;
  let tourNavigationPhase: 'transfer' | 'local' = 'local';
  const handoffs: { index: number; origin: number[]; normal: number[]; forward: number[]; speed: number; charge: number; remaining: number }[] = [];
  let testControls: Controls | null = null;
  const recentDriveEvents: string[] = [];

  const input = new Input(() => run.mode === 'playing', togglePause, () => {
    input.clear();
    testControls = null;
    vehicle.recover();
    resetNavigation();
    if (!authoredPrototype) ui.toast('Van recovered. Ready to roll.');
  });

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
    world.setActiveDestination(0);
    pendingResult = null;
    resetNavigation();
    handoffs.length = 0;
    resultDelay = 0;
    airBlend = 0;
    recentDriveEvents.length = 0;
    ui.resetJourney();
    sound.setPaused(false);
    sound.unlock();
    ui.setMode('playing');
    renderer.domElement.focus({ preventScroll: true });
    ui.toast(prototype?.hints.start ?? 'WASD to drive · Park in the glow to deliver');
    accumulator = 0;
    if (authoredPrototype && replay) { homeBlend = 0; firstFrame = true; }
    updateHUD();
  }

  function togglePause() {
    if (run.mode === 'playing') run.pause();
    else if (run.mode === 'paused') { run.resume(); renderer.domElement.focus({ preventScroll: true }); }
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
    }
    else if (action === 'home') {
      input.clear();
      testControls = null;
      run.home();
      syncTourCheckpoint();
      vehicle.reset();
      world.resetDelivery();
      world.setActiveDestination(0);
      pendingResult = null;
      resetNavigation();
      handoffs.length = 0;
      recentDriveEvents.length = 0;
      resultDelay = 0;
      ui.resetJourney();
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
        firstFrame = true;
        airBlend = 0;
        resetNavigation();
        ui.toast(tour ? `Back at ${tour.checkpoint.label}. Your deliveries are safe.` : prototype?.hints.recovery ?? 'Van recovered. Ready to roll.');
      } else if (event.type === 'land' && !run.finished && world.bayLevel && world.bayLevel.toLocal(event.normal).x > 0) {
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
    if (tourLayout) {
      const navigation = tourLayout.navigation(run.index, vehicle.normal, tourRoute, grounded, { forward: vehicle.forward });
      tourRoute = navigation.route;
      tourNavigationPhase = navigation.phase;
      return surfaceDistance(vehicle.normal, navigation.target) > 1e-6
        ? headingTo(vehicle.normal, vehicle.forward, navigation.target) : null;
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

  function updateCamera(dt: number) {
    const home = run.mode === 'home' || run.mode === 'complete';
    homeBlend = THREE.MathUtils.damp(homeBlend, home ? 1 : 0, 3.4, dt);
    airBlend = THREE.MathUtils.damp(airBlend, vehicle.drive?.phase === 'airborne' ? 1 : 0, 5.5, dt);
    const airMotion = reducedMotion ? airBlend * 0.25 : airBlend;
    const portrait = width / height < 0.94;
    space.children.forEach(child => { if (!(child instanceof THREE.Points)) child.visible = !portrait; });
    const welcomeFrame = ui.getWelcomeFrame();
    // Fit only the welcome orbit into the cached space between readable copy and CTA.
    // The follow position, chase FOV and canonical navigation are unchanged.
    const welcomeDiameter = welcomeFrame.diameter || (portrait ? width * 0.8 : height * 0.68);
    const distance = Math.min(260, PLANET_RADIUS / Math.sin(Math.atan(welcomeDiameter / height * Math.tan(THREE.MathUtils.degToRad(19)))));
    const orbit = spherical((tourLayout ? 23 : world.gardenLevel ? 42 : world.stationLevel ? -4 : 23) + (reducedMotion ? 0 : Math.sin(elapsed * 0.05) * 1.5), (tourLayout ? 0 : world.gardenLevel ? -78 : world.stationLevel ? 70 : bayPrototype ? 25 : 34) + (reducedMotion ? 0 : Math.sin(elapsed * 0.032) * 13));
    const homePosition = orbit.multiplyScalar(distance);
    const cameraHeight = authoredPrototype ? (portrait ? 13 : 11.8) : (portrait ? 10 : 7.8);
    const cameraBehind = authoredPrototype ? (portrait ? 10.2 : 8.4) : (portrait ? 13 : 10.2);
    const followPosition = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + cameraHeight + vehicle.altitude * 0.3 + airMotion * 1.3).addScaledVector(vehicle.forward, -cameraBehind - airMotion * 1.4);
    desiredPosition.copy(followPosition).lerp(homePosition, homeBlend);
    const lookAhead = authoredPrototype ? (run.finished ? 0.2 : 1.3) : 1.7;
    const followLook = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + 0.3 + (authoredPrototype ? Math.min(1, vehicle.altitude) * 0.4 : 0)).addScaledVector(vehicle.forward, lookAhead + airMotion * 1.2);
    desiredLook.copy(followLook).multiplyScalar(1 - homeBlend);
    const cameraUp = vehicle.normal.clone().lerp(UP, homeBlend).normalize();
    if (firstFrame) {
      camera.position.copy(desiredPosition);
      lookTarget.copy(desiredLook);
      camera.up.copy(cameraUp);
      firstFrame = false;
    } else {
      const smoothing = 1 - Math.exp(-dt * 5.0);
      camera.position.lerp(desiredPosition, smoothing);
      lookTarget.lerp(desiredLook, smoothing);
      camera.up.lerp(cameraUp, 1 - Math.exp(-dt * 6)).normalize();
    }
    if (camera.position.length() < PLANET_RADIUS + 3) camera.position.setLength(PLANET_RADIUS + 3);
    camera.lookAt(lookTarget);
    camera.fov = THREE.MathUtils.lerp(48 + (!reducedMotion && vehicle.boosting ? 3 : 0) + airMotion, 38, homeBlend);
    const offsetX = (width / 2 - (welcomeFrame.x || width * (portrait ? 0.5 : 0.68))) * homeBlend;
    const offsetY = (height / 2 - (welcomeFrame.y || height * 0.615)) * homeBlend;
    camera.setViewOffset(width, height, offsetX, offsetY, width, height);
    camera.updateProjectionMatrix();
  }

  function updateMarker() {
    const target = run.target;
    if (run.mode !== 'playing' || !target) { ui.marker.hidden = true; return; }
    const worldPoint = target.normal.clone().multiplyScalar(PLANET_RADIUS + 2.9);
    const projected = worldPoint.clone().project(camera);
    const facing = target.normal.dot(camera.position.clone().sub(target.normal.clone().multiplyScalar(PLANET_RADIUS))) > 0;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible = facing && projected.z > -1 && projected.z < 1 && x > 80 && x < width - 80 && y > 105 && y < height - 120 && ui.canShowTargetLabel(x, y);
    ui.marker.hidden = !visible;
    if (visible) { ui.marker.style.left = `${x}px`; ui.marker.style.top = `${y}px`; }
  }

  function updateHUD() {
    const destination = run.target;
    const distance = destination ? surfaceDistance(vehicle.normal, destination.normal) : 0;
    const roadExitHeading = updateRouteContext();
    // The compass always points to the active delivery, not a road lookahead.
    // A coincident destination has no meaningful tangent bearing; never invent one.
    const canonicalHeading = destination && distance > 1e-6
      ? headingTo(vehicle.normal, vehicle.forward, destination.normal) : null;
    const grounded = presentationGrounded();
    let bayState: BayHUDState = {
      phase: vehicle.drive?.phase ?? (grounded ? 'grounded' : 'airborne'), grounded,
      onRamp: false, onCoastalRoad: false, nearDestination: distance < 2.6,
    };
    const stop = tour?.currentStop;
    const level = stop?.level ?? (tour ? null : world.authoredLevel);
    if (vehicle.drive && level) {
      const surface = tourLayout ? tourLayout.sampleSurface(vehicle.normal) : level.sampleSurface(vehicle.normal);
      const isBay = tour ? stop?.id === 'bay' : !!world.bayLevel;
      bayState = {
        phase: vehicle.drive.phase, grounded, onRamp: surface.kind === 'ramp',
        onCoastalRoad: isBay && (tour ? tourRoute?.bayRoute : bayRoute) === 'coast',
        nearDestination: distance < (isBay ? 6.5 : 2.6), route: tour ? tourRoute?.route : roadRoute,
        stopId: stop?.id, navigationPhase: tour ? tourNavigationPhase : undefined,
        checkpointLabel: tour?.checkpoint.label,
        reverseToExit: !!tour && tour.checkpoint.kind === 'pad' && Math.abs(vehicle.speed) < 0.8
          && surfaceDistance(vehicle.normal, tour.checkpoint.pose.normal) < 2.5
          && roadExitHeading !== null && Math.abs(roadExitHeading) > Math.PI / 2,
      };
    }
    ui.update(run, vehicle.speed, vehicle.charge, distance, canonicalHeading, bayState);
    guidance = { sequence: ++guidanceSequence, target: destination?.normal.toArray() ?? null, canonicalHeading,
      directDestinationHeading: canonicalHeading,
      distance, grounded, normal: vehicle.normal.toArray(), forward: vehicle.forward.toArray(), phase: tourNavigationPhase,
      branch: tour ? tourRoute?.bayRoute ?? tourRoute?.route ?? null : bayRoute ?? roadRoute,
      cursor: compactCursor(tour ? tourRoute?.cursor : routeCursor), localCursor: compactCursor(tourRoute?.localCursor) };
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
        const delivery = run.update(step, vehicle.normal, vehicle.speed, vehicle.drive ? 0 : vehicle.altitude, grounded);
        if (delivery) {
          resetNavigation();
          world.celebrate(world.destinations[delivery.index].normal);
          world.setActiveDestination(run.index);
          sound.chime(delivery.finished);
          if (tour) {
            // A handoff changes only journey/cargo/reaction state, never the driving state.
            vehicle.syncVisual(0, elapsed);
            const origin = vehicle.consumeParcel();
            if (origin) {
              world.startDelivery(origin, delivery.index);
              if (import.meta.env.DEV) handoffs.push({ index: delivery.index, origin: origin.toArray(), normal: vehicle.normal.toArray(), forward: vehicle.forward.toArray(), speed: vehicle.speed, charge: vehicle.charge, remaining: vehicle.cargoCount });
            }
            syncTourCheckpoint();
            updateHUD();
            if (delivery.finished) ui.showTourResults(tour.elapsed, tour.splits, saveBest(tour.elapsed, TOUR_RECORD_KEY));
            else ui.toast(`Delivered to ${world.destinations[delivery.index].name}! Follow the connecting road to ${run.target!.name}.`);
          } else if (prototype && delivery.finished) {
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
          } else ui.toast(`Delivered to ${world.destinations[delivery.index].name}! Next stop: ${run.target!.name}.`);
        }
        accumulator -= step;
        if (run.mode !== 'playing') { accumulator = 0; break; }
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
    if (vehicle.drive) sound.updateDrive({ speed: vehicle.speed, boosting: vehicle.boosting, phase: vehicle.drive.phase, active: run.mode === 'playing' });
    vehicle.syncVisual(run.mode === 'paused' ? 0 : dt, elapsed);
    world.update(dt, elapsed, run.mode === 'paused');
    updateCamera(dt);
    renderer.render(scene, camera);
    updateMarker();
    uiClock += dt;
    if (uiClock > 0.06 || !guidance || (vehicle.drive?.phase === 'recovering') !== (ui.getNavigationPresentation().mode === 'recovering')) {
      uiClock = 0;
      updateHUD();
    }
    ui.advanceNavigation(run.mode === 'paused' ? 0 : dt);
    ui.app.dataset.ready = 'true';
  });

  // Local browser checks use real fixed-step driving; these controls never ship in production.
  if (import.meta.env.DEV && parameters.has('test')) {
    const recipientScreen = (id: string) => {
      const recipient = world.root.getObjectByName(`${id}-recipient`);
      if (!recipient) return null;
      const bounds = new THREE.Box3().setFromObject(recipient);
      const points = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y]
        .flatMap(y => [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z).project(camera))));
      const xs = points.map(p => (p.x * 0.5 + 0.5) * width);
      const ys = points.map(p => (-p.y * 0.5 + 0.5) * height);
      return { visible: recipient.visible && points.every(p => p.z > -1 && p.z < 1),
        left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    };
    const vehicleScreen = () => {
      // DEV-only observation of the rendered van, not a camera/controller input.
      // Project actual visible mesh vertices rather than an inflated world-axis box.
      const points: THREE.Vector3[] = [];
      vehicle.root.updateWorldMatrix(true, true);
      vehicle.root.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          points.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera));
        }
      });
      const xs = points.map(point => (point.x * 0.5 + 0.5) * width);
      const ys = points.map(point => (-point.y * 0.5 + 0.5) * height);
      return { visible: points.length > 0 && points.every(point => point.z > -1 && point.z < 1),
        left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    };
    // Explicit UI/state fixtures only; real-route acceptance never invokes these.
    const dockFixture = (index: number) => {
      const destination = world.destinations[index];
      if (!destination || !run.target || run.mode !== 'playing') return;
      input.clear();
      testControls = null;
      if (vehicle.drive) {
        vehicle.drive.reset();
        vehicle.drive.normal.copy(destination.normal);
        vehicle.drive.forward.copy(tourLayout?.stops[index]?.deliveredPose.forward ?? tangent(vehicle.drive.forward, vehicle.drive.normal));
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
        snapshot: () => ({
          mode: run.mode, index: run.index, finished: run.finished, elapsed: run.elapsed, parkedFor: run.parkedFor,
          speed: vehicle.speed, charge: vehicle.charge, altitude: vehicle.altitude,
          normal: vehicle.normal.toArray(), forward: vehicle.forward.toArray(),
          vehicleScreen: vehicleScreen(), welcomeFrame: { ...ui.getWelcomeFrame() },
          cameraRadius: camera.position.length(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          target: run.target?.normal.toArray(), heading: run.target ? headingTo(vehicle.normal, vehicle.forward, run.target.normal) : 0,
          prototype: authoredPrototype, prototypeId: prototype?.id ?? 'standard', phase: vehicle.drive?.phase, recoveries: vehicle.drive?.recoveries,
          jumps: vehicle.drive?.jumps, landings: vehicle.drive?.landings, cargoVisible: vehicle.cargoVisible,
          cargoCount: vehicle.cargoCount, cargoPositions: vehicle.getCargoWorldPositions().map(point => point.toArray()),
          landingGuideVisible: vehicle.landingGuideVisible,
          local: (tour?.currentStop?.level ?? world.authoredLevel)?.toLocal(vehicle.normal), reaction: authoredPrototype ? world.getDeliveryReactionSnapshot() : undefined,
          navigationTarget: guidance?.target?.slice(), route: tour ? tourRoute?.route : roadRoute,
          directDestinationHeading: guidance?.directDestinationHeading ?? null,
          hudHeading: ui.getNavigationPresentation().commandedHeading,
          displayedHeading: ui.getNavigationPresentation().displayedHeading,
          guidance: guidance ? { ...guidance, target: guidance.target?.slice() ?? null,
            normal: guidance.normal.slice(), forward: guidance.forward.slice(),
            cursor: guidance.cursor ? { ...guidance.cursor } : null,
            localCursor: guidance.localCursor ? { ...guidance.localCursor } : null,
            ...ui.getNavigationPresentation() } : null,
          tour: tour ? {
            splits: tour.splits, entryVisited: tour.entryVisited, currentStop: tour.currentStop?.id ?? null,
            checkpoint: { stopId: tour.checkpoint.stopId, kind: tour.checkpoint.kind, label: tour.checkpoint.label,
              pose: { normal: tour.checkpoint.pose.normal.toArray(), forward: tour.checkpoint.pose.forward.toArray() } },
            recoveryPose: { normal: world.drivingEnvironment!.recoveryPose.normal.toArray(), forward: world.drivingEnvironment!.recoveryPose.forward.toArray() },
            navigationPhase: tourNavigationPhase, routeCache: compactTourCache(),
            reactions: tourLayout!.stops.map((_stop, index) => world.getDeliveryReactionSnapshot(index)),
            handoffs: handoffs.map(handoff => ({ ...handoff })),
            locals: tourLayout!.stops.map(stop => stop.level.toLocal(vehicle.normal)),
            recipientScreens: tourLayout!.stops.map(stop => recipientScreen(stop.id)),
            sceneObjects: (() => { let count = 0; scene.traverse(() => count++); return count; })(),
          } : undefined,
          events: recentDriveEvents.slice(),
        }),
        routes: () => tourLayout ? {
          legs: tourLayout.stops.map((stop, index) => ({
            index, stopId: stop.id, destination: stop.destination.normal.toArray(),
            entry: { normal: stop.entryPose.normal.toArray(), forward: stop.entryPose.forward.toArray() },
            pad: { normal: stop.deliveredPose.normal.toArray(), forward: stop.deliveredPose.forward.toArray() },
            wide: tourLayout.routeForLeg(index, 'wide').map(point => point.toArray()),
            short: tourLayout.routeForLeg(index, 'short').map(point => point.toArray()),
          })),
          connectors: tourLayout.connectors.map(connector => ({ from: connector.from, to: connector.to, width: connector.width, path: connector.path.map(point => point.toArray()) })),
          closing: tourLayout.connectors[2].path.map(point => point.toArray()),
          spawn: tourLayout.spawnPose.normal.toArray(),
        } : roadLevel ? {
          outer: roadLevel.outerRoute.map(point => point.toArray()),
          inner: roadLevel.innerRoute.map(point => point.toArray()),
          destination: world.destinations[0].normal.toArray(),
        } : world.bayLevel ? {
          safe: world.bayLevel.safeRoute.map(point => point.toArray()),
          jump: world.bayLevel.jumpRoute.map(point => point.toArray()),
          destination: world.destinations[0].normal.toArray(),
        } : null,
        setControls: (controls: Controls | null) => {
          const finiteAxis = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
          testControls = controls ? { throttle: finiteAxis(controls.throttle), steer: finiteAxis(controls.steer), boost: Boolean(controls.boost) } : null;
        },
        /** Explicit pose fixture for navigation/UI isolation, never route-driveability evidence. */
        setNavigationFixture: (pose: { x?: number; y?: number; targetOffset?: number; heading?: number; speed?: number; altitude?: number; reset?: boolean }) => {
          if (run.mode !== 'playing' || !run.target) return;
          input.clear();
          testControls = null;
          const level = tour?.currentStop?.level ?? world.authoredLevel;
          let normal: THREE.Vector3, forward: THREE.Vector3;
          if (pose.targetOffset !== undefined) {
            forward = tangent(vehicle.forward, run.target.normal);
            normal = run.target.normal.clone().multiplyScalar(Math.cos(pose.targetOffset / PLANET_RADIUS))
              .addScaledVector(forward, Math.sin(pose.targetOffset / PLANET_RADIUS)).normalize();
            forward = tangent(forward, normal);
          } else {
            if (!level || pose.x === undefined || pose.y === undefined) return;
            normal = level.toNormal(pose.x, pose.y);
            forward = tangent(level.toNormal(pose.x + Math.cos(pose.heading ?? 0) * .01, pose.y + Math.sin(pose.heading ?? 0) * .01), normal);
          }
          if (vehicle.drive) {
            vehicle.drive.reset();
            vehicle.drive.normal.copy(normal);
            vehicle.drive.forward.copy(forward);
            vehicle.drive.speed = pose.speed ?? 0;
            vehicle.drive.contactRadius = vehicle.drive.environment.sampleSurface(normal).radius;
            vehicle.update(0, { throttle: 0, steer: 0, boost: false }, world.colliders);
          } else {
            vehicle.normal.copy(normal); vehicle.forward.copy(forward);
            vehicle.speed = pose.speed ?? 0; vehicle.altitude = pose.altitude ?? 0;
          }
          if (pose.reset) resetNavigation();
          updateHUD();
        },
        dockAtTarget: () => dockFixture(run.index),
        dockAtStop: (index: number) => { if (tourLayout && Number.isInteger(index)) dockFixture(index); },
      },
    });
  }
} catch (error) {
  console.error('Unable to initialize tiny planet:', error);
  ui.showError('Use an up-to-date version of Edge, Chrome, Firefox, or Safari with WebGL 2 support, and enable hardware acceleration in your browser settings. If the game still cannot start, try updating your graphics driver.');
}
