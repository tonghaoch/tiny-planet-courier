import * as THREE from 'three';
import type { BayPhase } from './bay-types';
import type { PrototypeId } from './delivery-prototypes';
import type { GameMode } from './game';
import { PLANET_RADIUS, spherical, UP } from './math';

export interface CameraFrame {
  readonly dt: number;
  readonly elapsed: number;
  readonly mode: GameMode;
  readonly finished: boolean;
  readonly vehicle: {
    readonly normal: Readonly<THREE.Vector3>;
    readonly forward: Readonly<THREE.Vector3>;
    readonly altitude: number;
    readonly boosting: boolean;
    readonly phase?: BayPhase;
  };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly welcomeFrame: { readonly x: number; readonly y: number; readonly diameter: number };
}

export class CameraRig {
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private homeBlend = 1;
  private airBlend = 0;
  private firstFrame = true;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly prototypeId: PrototypeId | null,
    private readonly reducedMotion: boolean,
  ) {}

  start(replay: boolean) {
    this.airBlend = 0;
    if (this.prototypeId !== null && replay) {
      this.homeBlend = 0;
      this.firstFrame = true;
    }
  }

  recovered() {
    this.firstFrame = true;
    this.airBlend = 0;
  }

  update({ dt, elapsed, mode, finished, vehicle, viewport, welcomeFrame }: CameraFrame) {
    const { camera, prototypeId, reducedMotion, lookTarget, desiredPosition, desiredLook } = this;
    const { width, height } = viewport;
    const authoredPrototype = prototypeId !== null;
    const home = mode === 'home' || mode === 'complete';
    this.homeBlend = THREE.MathUtils.damp(this.homeBlend, home ? 1 : 0, 3.4, dt);
    this.airBlend = THREE.MathUtils.damp(this.airBlend, vehicle.phase === 'airborne' ? 1 : 0, 5.5, dt);
    const { homeBlend, airBlend } = this;
    const airMotion = reducedMotion ? airBlend * 0.25 : airBlend;
    const portrait = width / height < 0.94;
    // Fit only the welcome orbit into the cached space between readable copy and CTA.
    // The follow position, chase FOV and canonical navigation are unchanged.
    const welcomeDiameter = welcomeFrame.diameter || (portrait ? width * 0.8 : height * 0.68);
    const distance = Math.min(
      260,
      PLANET_RADIUS / Math.sin(Math.atan((welcomeDiameter / height) * Math.tan(THREE.MathUtils.degToRad(19)))),
    );
    const orbit = spherical(
      (prototypeId === 'tour' ? 23 : prototypeId === 'garden' ? 42 : prototypeId === 'station' ? -4 : 23) +
        (reducedMotion ? 0 : Math.sin(elapsed * 0.05) * 1.5),
      (prototypeId === 'tour'
        ? 0
        : prototypeId === 'garden'
          ? -78
          : prototypeId === 'station'
            ? 70
            : prototypeId === 'bay'
              ? 25
              : 34) + (reducedMotion ? 0 : Math.sin(elapsed * 0.032) * 13),
    );
    const homePosition = orbit.multiplyScalar(distance);
    const cameraHeight = authoredPrototype ? (portrait ? 13 : 11.8) : portrait ? 10 : 7.8;
    const cameraBehind = authoredPrototype ? (portrait ? 10.2 : 8.4) : portrait ? 13 : 10.2;
    const followPosition = vehicle.normal
      .clone()
      .multiplyScalar(PLANET_RADIUS + cameraHeight + vehicle.altitude * 0.3 + airMotion * 1.3)
      .addScaledVector(vehicle.forward, -cameraBehind - airMotion * 1.4);
    desiredPosition.copy(followPosition).lerp(homePosition, homeBlend);
    const lookAhead = authoredPrototype ? (finished ? 0.2 : 1.3) : 1.7;
    const followLook = vehicle.normal
      .clone()
      .multiplyScalar(PLANET_RADIUS + 0.3 + (authoredPrototype ? Math.min(1, vehicle.altitude) * 0.4 : 0))
      .addScaledVector(vehicle.forward, lookAhead + airMotion * 1.2);
    desiredLook.copy(followLook).multiplyScalar(1 - homeBlend);
    const cameraUp = vehicle.normal.clone().lerp(UP, homeBlend).normalize();
    if (this.firstFrame) {
      camera.position.copy(desiredPosition);
      lookTarget.copy(desiredLook);
      camera.up.copy(cameraUp);
      this.firstFrame = false;
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
}
