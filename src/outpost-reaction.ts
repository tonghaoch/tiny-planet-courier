import { Group, MathUtils, MeshStandardMaterial, Vector3 } from 'three';

/** Reusable only by the two compact outposts; each scene owns its state and lamp. */
export class OutpostDeliveryReaction {
  private elapsed = 0;
  private started = false;
  private readonly parcelStart = new Vector3();

  constructor(
    readonly root: Group,
    private readonly destination: string,
    private readonly duration: number,
    private readonly recipient: Group,
    private readonly arm: Group,
    private readonly parcel: Group,
    private readonly lamp: MeshStandardMaterial,
    private readonly reducedMotion: boolean,
  ) {
    this.reset();
  }

  start(origin: Vector3) {
    this.reset();
    this.started = true;
    this.parcelStart.copy(origin);
    this.root.updateWorldMatrix(true, true);
    this.parcel.position.copy(this.root.worldToLocal(origin.clone()));
    this.parcel.visible = true;
  }

  reset() {
    this.elapsed = 0;
    this.started = false;
    this.parcelStart.set(0, 0, 0);
    this.arm.rotation.set(0, 0, 0);
    this.parcel.position.set(0, 0, 0);
    this.parcel.rotation.set(0, 0, 0);
    this.parcel.visible = false;
    this.lamp.emissiveIntensity = 0.18;
  }

  update(dt: number) {
    if (!this.started || this.elapsed >= this.duration || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const handoff = MathUtils.smoothstep(this.elapsed, 0.2, 1.6);
    const welcome = MathUtils.smoothstep(this.elapsed, 0.4, 1);
    this.arm.rotation.z = welcome * (this.reducedMotion ? -0.3 : -0.45 + Math.sin(this.elapsed * 10) * 0.2);
    this.lamp.emissiveIntensity = 0.18 + MathUtils.smoothstep(this.elapsed, 0.5, 2);
    this.root.updateWorldMatrix(true, true);
    const end = this.recipient.localToWorld(new Vector3(0.09, 0.36, 0.12));
    const position = this.parcelStart.clone().lerp(end, handoff);
    const up = new Vector3(0, 1, 0).transformDirection(this.root.matrixWorld);
    position.addScaledVector(up, Math.sin(handoff * Math.PI) * (this.reducedMotion ? 0.08 : 0.5));
    this.parcel.position.copy(this.root.worldToLocal(position));
  }

  snapshot() {
    return {
      destination: this.destination,
      active: this.started && this.elapsed < this.duration,
      progress: this.started ? this.elapsed / this.duration : 0,
      recipientVisible: this.recipient.visible,
      parcelVisible: this.parcel.visible,
      windowGlow: this.lamp.emissiveIntensity,
    };
  }
}
