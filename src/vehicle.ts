import * as THREE from 'three';
import { advanceOnSphere, PLANET_RADIUS, START_FORWARD, START_NORMAL, surfaceDistance, tangent, type Collider } from './math';

export interface Controls { throttle: number; steer: number; boost: boolean; }
const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });

export class Vehicle {
  readonly root = new THREE.Group();
  readonly normal = START_NORMAL.clone();
  readonly forward = START_FORWARD.clone();
  speed = 0;
  charge = 1;
  altitude = 0;
  boosting = false;
  private verticalSpeed = 0;
  private wasBoosting = false;
  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly frontWheels: THREE.Group[] = [];
  private readonly parcel = new THREE.Group();
  private readonly dust: THREE.Mesh[] = [];
  private readonly dustLives: number[] = [];
  private dustCursor = 0;
  private trailClock = 0;
  private steerVisual = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    const cream = mat(0xf8ebcf);
    const orange = mat(0xf29569);
    const dark = mat(0x33494b);
    const glass = mat(0x69a7ab, { metalness: 0.28, roughness: 0.3 });
    const rubber = mat(0x2d3536);
    const metal = mat(0xe5d8bf, { metalness: 0.25 });
    const box = (x: number, y: number, z: number, material: THREE.Material, position: number[], parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    box(0.62, 0.12, 1.1, dark, [0, 0.21, 0]);
    box(0.66, 0.39, 0.72, cream, [0, 0.44, -0.16]);
    box(0.64, 0.32, 0.40, orange, [0, 0.37, 0.39]);
    box(0.62, 0.33, 0.39, cream, [0, 0.63, 0.24]);
    const windshield = box(0.54, 0.23, 0.028, glass, [0, 0.64, 0.443]);
    windshield.rotation.x = -0.08;
    for (const x of [-0.322, 0.322]) {
      box(0.018, 0.22, 0.27, glass, [x, 0.65, 0.24]);
      box(0.026, 0.08, 0.17, orange, [x, 0.46, -0.1]);
      box(0.045, 0.08, 0.14, dark, [x * 1.14, 0.58, 0.37]);
    }
    box(0.68, 0.065, 0.84, orange, [0, 0.78, 0.04]);
    box(0.69, 0.09, 0.085, metal, [0, 0.24, 0.62]);
    box(0.68, 0.07, 0.07, metal, [0, 0.24, -0.57]);
    const light = mat(0xffe9ad, { emissive: 0xffd494, emissiveIntensity: 0.7 });
    for (const x of [-0.22, 0.22]) {
      box(0.14, 0.10, 0.025, light, [x, 0.43, 0.6]);
      box(0.08, 0.09, 0.028, mat(0xd87861), [x, 0.42, -0.532]);
    }
    box(0.21, 0.08, 0.02, dark, [0, 0.35, 0.603]);
    box(0.40, 0.06, 0.07, dark, [0, 0.85, -0.2]);
    box(0.40, 0.06, 0.07, dark, [0, 0.85, 0.19]);
    this.parcel.position.set(0, 0.97, -0.1);
    box(0.35, 0.24, 0.35, mat(0xc99c6b), [0, 0, 0], this.parcel);
    box(0.075, 0.25, 0.36, cream, [0, 0, 0], this.parcel);
    box(0.17, 0.10, 0.006, cream, [0.07, 0, 0.18], this.parcel);
    this.body.add(this.parcel);
    for (const x of [-0.35, 0.35]) {
      for (const z of [-0.36, 0.38]) {
        const axle = new THREE.Group();
        axle.position.set(x, 0.20, z);
        const wheel = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 12), rubber);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wheel.add(tire);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.145, 12), metal);
        cap.rotation.z = Math.PI / 2;
        wheel.add(cap);
        axle.add(wheel);
        this.wheels.push(wheel);
        if (z > 0) this.frontWheels.push(axle);
        this.body.add(axle);
      }
    }
    this.root.add(this.body);
    scene.add(this.root);
    const dustGeo = new THREE.IcosahedronGeometry(0.12, 0);
    for (let i = 0; i < 24; i++) {
      const puff = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color: 0xf5d9aa, transparent: true, opacity: 0, depthWrite: false }));
      puff.visible = false;
      scene.add(puff);
      this.dust.push(puff);
      this.dustLives.push(0);
    }
    this.syncVisual(0, 0);
  }

  reset() {
    this.normal.copy(START_NORMAL);
    this.forward.copy(START_FORWARD);
    this.speed = 0;
    this.charge = 1;
    this.altitude = 0;
    this.verticalSpeed = 0;
    this.boosting = false;
    this.wasBoosting = false;
    this.steerVisual = 0;
    this.dust.forEach((puff, i) => { puff.visible = false; this.dustLives[i] = 0; });
    this.syncVisual(0, 0);
  }

  recover() {
    this.altitude = 0;
    this.verticalSpeed = 0;
    this.speed = 0;
    this.forward.copy(tangent(this.forward, this.normal));
  }

  update(dt: number, controls: Controls, colliders: Collider[]) {
    this.boosting = controls.boost && this.charge > 0.04 && controls.throttle > 0 && this.speed > 0.9;
    this.charge = THREE.MathUtils.clamp(this.charge + dt * (this.boosting ? -0.36 : 0.15), 0, 1);
    const maxSpeed = this.boosting ? 7.8 : 4.7;
    if (controls.throttle > 0) this.speed = THREE.MathUtils.damp(this.speed, maxSpeed, 1.8, dt);
    else if (controls.throttle < 0) this.speed = THREE.MathUtils.damp(this.speed, -1.9, this.speed > 0 ? 4.5 : 2, dt);
    else this.speed = THREE.MathUtils.damp(this.speed, 0, 2.1, dt);
    if (Math.abs(this.speed) < 0.015) this.speed = 0;
    const steerRate = (0.45 + Math.min(1, Math.abs(this.speed) / 2)) * (this.boosting ? 0.85 : 1.2);
    this.forward.applyAxisAngle(this.normal, -controls.steer * steerRate * dt * (this.speed < -0.1 ? -1 : 1));
    advanceOnSphere(this.normal, this.forward, this.speed * dt);
    if (this.boosting && !this.wasBoosting && this.altitude < 0.01 && this.speed > 2.5) this.verticalSpeed = 1.75;
    this.wasBoosting = controls.boost;
    this.verticalSpeed -= 6.8 * dt;
    this.altitude = Math.max(0, this.altitude + this.verticalSpeed * dt);
    if (this.altitude === 0) this.verticalSpeed = 0;
    if (this.altitude < 0.25) {
      for (const collider of colliders) {
        const distance = surfaceDistance(this.normal, collider.normal);
        const clearance = collider.radius + 0.31;
        if (distance >= clearance) continue;
        const away = tangent(this.normal.clone().sub(collider.normal), this.normal);
        this.normal.addScaledVector(away, (clearance - distance) / PLANET_RADIUS).normalize();
        this.forward.copy(tangent(this.forward, this.normal));
        this.speed *= Math.exp(-10 * dt);
      }
    }
    this.steerVisual = THREE.MathUtils.damp(this.steerVisual, controls.steer, 10, dt);
  }

  syncVisual(dt: number, time: number) {
    this.root.position.copy(this.normal).multiplyScalar(PLANET_RADIUS + 0.105 + this.altitude);
    const right = new THREE.Vector3().crossVectors(this.normal, this.forward).normalize();
    this.matrix.makeBasis(right, this.normal, this.forward);
    this.root.quaternion.setFromRotationMatrix(this.matrix);
    this.body.rotation.z = -this.steerVisual * this.speed * 0.022;
    this.body.rotation.x = this.boosting ? -0.055 : Math.sin(time * 16) * Math.abs(this.speed) * 0.003;
    this.parcel.rotation.z = Math.sin(time * 8) * Math.abs(this.speed) * 0.008;
    this.wheels.forEach(wheel => wheel.rotation.x += this.speed * dt / 0.19);
    this.frontWheels.forEach(axle => axle.rotation.y = -this.steerVisual * 0.35);
    this.trailClock += dt;
    if (this.speed > 1.5 && this.trailClock > (this.boosting ? 0.035 : 0.09)) {
      this.trailClock = 0;
      const i = this.dustCursor++ % this.dust.length;
      this.dust[i].position.copy(this.root.position).addScaledVector(this.forward, -0.7).addScaledVector(right, Math.sin(time * 81) * 0.22).addScaledVector(this.normal, 0.17);
      this.dust[i].visible = true;
      this.dustLives[i] = 0.7;
      (this.dust[i].material as THREE.MeshBasicMaterial).color.setHex(this.boosting ? 0xffc68a : 0xe5d5ad);
    }
    this.dust.forEach((puff, i) => {
      this.dustLives[i] = Math.max(0, this.dustLives[i] - dt);
      puff.visible = this.dustLives[i] > 0;
      if (!puff.visible) return;
      const progress = 1 - this.dustLives[i] / 0.7;
      puff.scale.setScalar(0.6 + progress * 1.6);
      puff.position.addScaledVector(puff.position.clone().normalize(), dt * 0.26);
      (puff.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.34;
    });
  }
}
