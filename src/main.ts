import * as THREE from 'three';
import './style.css';
import { AudioFeedback } from './audio';
import { DeliveryRun, saveBest } from './game';
import { Input } from './input';
import { headingTo, PLANET_RADIUS, spherical, surfaceDistance, tangent, UP } from './math';
import { UI } from './ui';
import { Vehicle } from './vehicle';
import { createSpace, PlanetWorld } from './world';

const ui = new UI();
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const world = new PlanetWorld();
  scene.add(world.root);
  const vehicle = new Vehicle(scene);
  const run = new DeliveryRun(world.destinations);
  const sound = new AudioFeedback();
  world.setActiveDestination(0);

  const lookTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  let homeBlend = 1;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let firstFrame = true;
  let elapsed = 0;
  let accumulator = 0;
  let last = performance.now();
  let uiClock = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const input = new Input(() => run.mode === 'playing', togglePause, () => {
    vehicle.recover();
    ui.toast('Van recovered. Ready to roll.');
  });

  function start() {
    input.clear();
    vehicle.reset();
    run.start();
    world.setActiveDestination(0);
    sound.unlock();
    ui.setMode('playing');
    renderer.domElement.focus({ preventScroll: true });
    ui.toast('WASD to drive · Park in the glow to deliver');
    accumulator = 0;
  }

  function togglePause() {
    if (run.mode === 'playing') run.pause();
    else if (run.mode === 'paused') { run.resume(); renderer.domElement.focus({ preventScroll: true }); }
    input.clear();
    ui.setMode(run.mode);
  }

  ui.onAction = action => {
    if (action === 'start' || action === 'restart') start();
    else if (action === 'pause' || action === 'resume') togglePause();
    else if (action === 'sound') ui.setSound(sound.toggle());
    else if (action === 'home') {
      input.clear();
      run.home();
      vehicle.reset();
      world.setActiveDestination(0);
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

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    input.clear();
    run.pause();
    ui.showError('Your browser lost its 3D graphics connection. Close other graphics-heavy tabs, then reload.');
    renderer.setAnimationLoop(null);
  });

  function updateCamera(dt: number) {
    const home = run.mode === 'home' || run.mode === 'complete';
    homeBlend = THREE.MathUtils.damp(homeBlend, home ? 1 : 0, 3.4, dt);
    const portrait = width / height < 0.94;
    // Keep the portrait headline clear of foreground-looking background planets.
    space.children.forEach(child => { if (!(child instanceof THREE.Points)) child.visible = !portrait; });
    const distance = portrait ? Math.max(56, PLANET_RADIUS * height / (width * 0.91 * Math.tan(THREE.MathUtils.degToRad(19)))) : 54;
    const orbit = spherical(23 + Math.sin(elapsed * 0.05) * 1.5, 34 + (reducedMotion ? 0 : Math.sin(elapsed * 0.032) * 13));
    const homePosition = orbit.multiplyScalar(distance);
    const followPosition = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + (portrait ? 10 : 7.8) + vehicle.altitude * 0.3).addScaledVector(vehicle.forward, portrait ? -13 : -10.2);
    desiredPosition.copy(followPosition).lerp(homePosition, homeBlend);
    const followLook = vehicle.normal.clone().multiplyScalar(PLANET_RADIUS + 0.3).addScaledVector(vehicle.forward, 1.7);
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
    camera.fov = THREE.MathUtils.lerp(48 + (vehicle.boosting ? 3 : 0), 38, homeBlend);
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
      const controls = input.controls;
      while (accumulator >= 1 / 120) {
        const step = 1 / 120;
        vehicle.update(step, controls, world.colliders);
        const delivery = run.update(step, vehicle.normal, vehicle.speed, vehicle.altitude);
        if (delivery) {
          world.celebrate(world.destinations[delivery.index].normal);
          world.setActiveDestination(run.index);
          sound.chime(delivery.finished);
          if (delivery.finished) {
            vehicle.speed = 0;
            input.clear();
            ui.showResults(run.elapsed, saveBest(run.elapsed));
          } else ui.toast(`Delivered to ${world.destinations[delivery.index].name}! Next stop: ${run.target!.name}.`);
        }
        accumulator -= step;
        if (run.mode !== 'playing') { accumulator = 0; break; }
      }
    } else accumulator = 0;
    vehicle.syncVisual(run.mode === 'paused' ? 0 : dt, elapsed);
    world.update(dt, elapsed);
    updateCamera(dt);
    renderer.render(scene, camera);
    updateMarker();
    uiClock += dt;
    if (uiClock > 0.06) {
      uiClock = 0;
      const distance = run.target ? surfaceDistance(vehicle.normal, run.target.normal) : 0;
      const heading = run.target ? headingTo(vehicle.normal, vehicle.forward, run.target.normal) : 0;
      ui.update(run, vehicle.speed, vehicle.charge, distance, heading);
    }
    ui.app.dataset.ready = 'true';
  });

  // A local-only bridge makes browser checks deterministic; Vite strips this in production.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
    Object.assign(window, {
      __planetTest: {
        snapshot: () => ({ mode: run.mode, index: run.index, elapsed: run.elapsed, speed: vehicle.speed, charge: vehicle.charge, altitude: vehicle.altitude, normal: vehicle.normal.toArray(), forward: vehicle.forward.toArray(), cameraRadius: camera.position.length(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, target: run.target?.normal.toArray(), heading: run.target ? headingTo(vehicle.normal, vehicle.forward, run.target.normal) : 0 }),
        dockAtTarget: () => {
          if (!run.target || run.mode !== 'playing') return;
          input.clear();
          vehicle.normal.copy(run.target.normal);
          vehicle.forward.copy(tangent(vehicle.forward, vehicle.normal));
          vehicle.recover();
        },
      },
    });
  }
} catch (error) {
  console.error('Unable to initialize tiny planet:', error);
  ui.showError('Use an up-to-date version of Edge, Chrome, Firefox, or Safari with WebGL 2 support, and enable hardware acceleration in your browser settings. If the game still cannot start, try updating your graphics driver.');
}
