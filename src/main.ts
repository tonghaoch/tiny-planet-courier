import * as THREE from 'three';
import './style.css';
import { AudioFeedback } from './audio';
import type { BayDriveEvent } from './bay-types';
import { BAY_RECORD_KEY, DeliveryRun, saveBest } from './game';
import { Input } from './input';
import { headingTo, PLANET_RADIUS, spherical, surfaceDistance, tangent, UP } from './math';
import { UI, type BayHUDState } from './ui';
import { Vehicle, type Controls } from './vehicle';
import { createSpace, PlanetWorld } from './world';

const parameters = new URLSearchParams(location.search);
const bayPrototype = import.meta.env.DEV && parameters.get('prototype') === 'bay';
const ui = new UI(bayPrototype);
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
  const world = new PlanetWorld(bayPrototype, reducedMotion);
  scene.add(world.root);
  const vehicle = new Vehicle(scene, world.bayEnvironment, reducedMotion);
  const run = new DeliveryRun(world.destinations, { keepDrivingOnFinish: bayPrototype });
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
  let pendingBayResult: { time: number; newRecord: boolean } | null = null;
  let testControls: Controls | null = null;
  const recentDriveEvents: string[] = [];

  const input = new Input(() => run.mode === 'playing', togglePause, () => {
    input.clear();
    testControls = null;
    vehicle.recover();
    if (!bayPrototype) ui.toast('Van recovered. Ready to roll.');
  });

  function start() {
    const replay = run.mode !== 'home';
    input.clear();
    testControls = null;
    vehicle.reset();
    run.start();
    world.resetBayDelivery();
    world.setActiveDestination(0);
    pendingBayResult = null;
    resultDelay = 0;
    airBlend = 0;
    recentDriveEvents.length = 0;
    ui.resetJourney();
    sound.setPaused(false);
    sound.unlock();
    ui.setMode('playing');
    renderer.domElement.focus({ preventScroll: true });
    ui.toast(bayPrototype ? 'Coast road for a cruise. Hold boost for the ramp.' : 'WASD to drive · Park in the glow to deliver');
    accumulator = 0;
    if (bayPrototype && replay) { homeBlend = 0; firstFrame = true; }
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
      vehicle.reset();
      world.resetBayDelivery();
      world.setActiveDestination(0);
      pendingBayResult = null;
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
        ui.toast('Ready for another go. Boost before the ramp—or take the coast.');
      } else if (event.type === 'land' && !run.finished && world.bayLevel && world.bayLevel.toLocal(event.normal).x > 0) {
        ui.toast('Across the bay! Brake for the bakery.');
      }
    }
  }

  function navigationTarget(): THREE.Vector3 | undefined {
    if (!run.target) return undefined;
    if (!world.bayLevel || vehicle.drive?.phase !== 'grounded') return run.target.normal;
    const local = world.bayLevel.toLocal(vehicle.normal);
    if (local.y < 1.3) return run.target.normal;
    const route = world.bayLevel.safeRoute;
    let closest = 0;
    let bestDistance = Infinity;
    route.forEach((point, i) => {
      const distance = surfaceDistance(vehicle.normal, point);
      if (distance < bestDistance) { closest = i; bestDistance = distance; }
    });
    let ahead = Math.min(route.length - 1, closest + 1);
    while (ahead < route.length - 1 && surfaceDistance(vehicle.normal, route[ahead]) < 1.8) ahead++;
    return route[ahead] ?? run.target.normal;
  }

  function updateCamera(dt: number) {
    const home = run.mode === 'home' || run.mode === 'complete';
    homeBlend = THREE.MathUtils.damp(homeBlend, home ? 1 : 0, 3.4, dt);
    airBlend = THREE.MathUtils.damp(airBlend, vehicle.drive?.phase === 'airborne' ? 1 : 0, 5.5, dt);
    const airMotion = reducedMotion ? airBlend * 0.25 : airBlend;
    const portrait = width / height < 0.94;
    space.children.forEach(child => { if (!(child instanceof THREE.Points)) child.visible = !portrait; });
    const distance = portrait ? Math.max(56, PLANET_RADIUS * height / (width * 0.91 * Math.tan(THREE.MathUtils.degToRad(19)))) : 54;
    const orbit = spherical(23 + (reducedMotion ? 0 : Math.sin(elapsed * 0.05) * 1.5), (bayPrototype ? 25 : 34) + (reducedMotion ? 0 : Math.sin(elapsed * 0.032) * 13));
    const homePosition = orbit.multiplyScalar(distance);
    const cameraHeight = bayPrototype ? (portrait ? 13 : 11.8) : (portrait ? 10 : 7.8);
    const cameraBehind = bayPrototype ? (portrait ? 10.2 : 8.4) : (portrait ? 13 : 10.2);
    const followPosition = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + cameraHeight + vehicle.altitude * 0.3 + airMotion * 1.3).addScaledVector(vehicle.forward, -cameraBehind - airMotion * 1.4);
    desiredPosition.copy(followPosition).lerp(homePosition, homeBlend);
    const lookAhead = bayPrototype ? (run.finished ? 0.2 : 1.3) : 1.7;
    const followLook = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + 0.3 + (bayPrototype ? Math.min(1, vehicle.altitude) * 0.4 : 0)).addScaledVector(vehicle.forward, lookAhead + airMotion * 1.2);
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
    const offsetX = portrait ? 0 : -width * 0.18 * homeBlend;
    const offsetY = portrait ? -height * 0.115 * homeBlend : -height * 0.018 * homeBlend;
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
    const visible = facing && projected.z > -1 && projected.z < 1 && x > 80 && x < width - 80 && y > 105 && y < height - 120;
    ui.marker.hidden = !visible;
    if (visible) { ui.marker.style.left = `${x}px`; ui.marker.style.top = `${y}px`; }
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
        const delivery = run.update(step, vehicle.normal, vehicle.speed, vehicle.drive ? 0 : vehicle.altitude, grounded);
        if (delivery) {
          world.celebrate(world.destinations[delivery.index].normal);
          world.setActiveDestination(run.index);
          sound.chime(delivery.finished);
          if (bayPrototype && delivery.finished) {
            vehicle.syncVisual(0, elapsed);
            const parcelStart = vehicle.getParcelWorldPosition();
            vehicle.setCargoVisible(false);
            world.startBayDelivery(parcelStart);
            pendingBayResult = { time: run.elapsed, newRecord: saveBest(run.elapsed, BAY_RECORD_KEY) };
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
      if (pendingBayResult) {
        resultDelay -= dt;
        if (resultDelay <= 0) {
          ui.showBayResults(pendingBayResult.time, pendingBayResult.newRecord);
          pendingBayResult = null;
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
    if (uiClock > 0.06) {
      uiClock = 0;
      const distance = run.target ? surfaceDistance(vehicle.normal, run.target.normal) : 0;
      const navigation = navigationTarget();
      const heading = navigation ? headingTo(vehicle.normal, vehicle.forward, navigation) : 0;
      let bayState: BayHUDState | undefined;
      if (vehicle.drive && world.bayLevel) {
        const surface = world.bayLevel.sampleSurface(vehicle.normal);
        bayState = { phase: vehicle.drive.phase, onRamp: surface.kind === 'ramp', onCoastalRoad: world.bayLevel.toLocal(vehicle.normal).y > 1.3, nearBakery: distance < 6.5 };
      }
      ui.update(run, vehicle.speed, vehicle.charge, distance, heading, bayState);
      ui.setSound(sound.enabled);
    }
    ui.app.dataset.ready = 'true';
  });

  // Local browser checks use real fixed-step driving; these controls never ship in production.
  if (import.meta.env.DEV && parameters.has('test')) {
    Object.assign(window, {
      __planetTest: {
        snapshot: () => ({
          mode: run.mode, index: run.index, finished: run.finished, elapsed: run.elapsed,
          speed: vehicle.speed, charge: vehicle.charge, altitude: vehicle.altitude,
          normal: vehicle.normal.toArray(), forward: vehicle.forward.toArray(),
          cameraRadius: camera.position.length(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          target: run.target?.normal.toArray(), heading: run.target ? headingTo(vehicle.normal, vehicle.forward, run.target.normal) : 0,
          prototype: bayPrototype, phase: vehicle.drive?.phase, recoveries: vehicle.drive?.recoveries,
          jumps: vehicle.drive?.jumps, landings: vehicle.drive?.landings, cargoVisible: vehicle.cargoVisible,
          landingGuideVisible: vehicle.landingGuideVisible,
          local: world.bayLevel?.toLocal(vehicle.normal), reaction: bayPrototype ? world.getBayReactionSnapshot() : undefined,
          events: recentDriveEvents.slice(),
        }),
        routes: () => world.bayLevel ? {
          safe: world.bayLevel.safeRoute.map(point => point.toArray()),
          jump: world.bayLevel.jumpRoute.map(point => point.toArray()),
          destination: world.destinations[0].normal.toArray(),
        } : null,
        setControls: (controls: Controls | null) => {
          const finiteAxis = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
          testControls = controls ? { throttle: finiteAxis(controls.throttle), steer: finiteAxis(controls.steer), boost: Boolean(controls.boost) } : null;
        },
        dockAtTarget: () => {
          if (!run.target || run.mode !== 'playing') return;
          input.clear();
          testControls = null;
          if (vehicle.drive) {
            vehicle.drive.reset();
            vehicle.drive.normal.copy(run.target.normal);
            vehicle.drive.forward.copy(tangent(vehicle.drive.forward, vehicle.drive.normal));
            vehicle.drive.contactRadius = vehicle.drive.environment.sampleSurface(vehicle.drive.normal).radius;
            vehicle.update(0, { throttle: 0, steer: 0, boost: false }, world.colliders);
          } else {
            vehicle.normal.copy(run.target.normal);
            vehicle.forward.copy(tangent(vehicle.forward, vehicle.normal));
            vehicle.recover();
          }
        },
      },
    });
  }
} catch (error) {
  console.error('Unable to initialize tiny planet:', error);
  ui.showError('Use an up-to-date version of Edge, Chrome, Firefox, or Safari with WebGL 2 support, and enable hardware acceleration in your browser settings. If the game still cannot start, try updating your graphics driver.');
}
