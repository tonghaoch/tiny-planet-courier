import { Group, MathUtils, MeshStandardMaterial, Vector3 } from 'three';
import { STATION_LEVEL } from './station-level';

export class StationDeliveryReaction {
  private elapsed = 0;
  private started = false;
  private readonly parcelStart = new Vector3();

  constructor(
    readonly root: Group,
    private readonly recipient: Group,
    private readonly arm: Group,
    private readonly parcel: Group,
    private readonly telescope: Group,
    private readonly lamp: MeshStandardMaterial,
    private readonly reducedMotion: boolean,
  ) { this.reset(); }

  start(parcelStart: Vector3) {
    this.reset();
    this.started = true;
    this.parcelStart.copy(parcelStart);
    this.root.updateWorldMatrix(true, true);
    this.parcel.position.copy(this.root.worldToLocal(parcelStart.clone()));
    this.parcel.visible = true;
  }

  reset() {
    this.elapsed = 0;
    this.started = false;
    this.parcelStart.set(0, 0, 0);
    this.recipient.position.set(-0.62, 0.03, 0.83);
    this.recipient.rotation.set(0, 0, 0);
    this.arm.rotation.set(0, 0, 0);
    this.parcel.position.set(0, 0, 0);
    this.parcel.rotation.set(0, 0, 0);
    this.parcel.visible = false;
    this.telescope.rotation.y = -0.35;
    this.lamp.emissiveIntensity = 0.18;
  }

  update(dt: number) {
    if (!this.started || this.elapsed >= STATION_LEVEL.reactionDuration || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(STATION_LEVEL.reactionDuration, this.elapsed + dt);
    const smooth = (t: number) => { t = MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const approach = smooth((this.elapsed - 0.15) / 0.7);
    this.recipient.position.set(-0.62 + 0.36 * approach, 0.03, 0.83 + 0.37 * approach);
    const wave = smooth((this.elapsed - 0.6) / 0.3);
    this.arm.rotation.z = wave * (this.reducedMotion ? -0.3 : -0.45 + Math.sin((this.elapsed - 0.6) * 10) * 0.25);
    this.lamp.emissiveIntensity = 0.18 + smooth((this.elapsed - 0.3) / 0.9);
    this.telescope.rotation.y = -0.35 + (this.reducedMotion ? 0.18 : 0.75) * smooth((this.elapsed - 0.4) / 1.6);
    const handoff = smooth((this.elapsed - 0.48) / 1.02);
    this.root.updateWorldMatrix(true, true);
    const destination = this.recipient.localToWorld(new Vector3(0.08, 0.46, 0.28));
    const position = this.parcelStart.clone().lerp(destination, handoff);
    const up = new Vector3(0, 1, 0).transformDirection(this.root.matrixWorld);
    position.addScaledVector(up, Math.sin(handoff * Math.PI) * (this.reducedMotion ? 0.15 : 0.62));
    this.parcel.position.copy(this.root.worldToLocal(position));
    this.parcel.rotation.y = this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.4;
  }

  snapshot() {
    return {
      destination: 'observatory',
      active: this.started && this.elapsed < STATION_LEVEL.reactionDuration,
      progress: this.started ? this.elapsed / STATION_LEVEL.reactionDuration : 0,
      recipientVisible: this.recipient.visible,
      parcelVisible: this.parcel.visible,
      windowGlow: this.lamp.emissiveIntensity,
      telescopeTurn: this.telescope.rotation.y + 0.35,
    };
  }
}
