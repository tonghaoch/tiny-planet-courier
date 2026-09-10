import { Group, MathUtils, MeshStandardMaterial, Vector3 } from 'three';
import { BAY_LEVEL } from './bay-level';

export class BayDeliveryReaction {
  private elapsed = 0;
  private started = false;
  private readonly parcelStartWorld = new Vector3();

  constructor(
    readonly root: Group,
    private readonly hinge: Group,
    private readonly recipient: Group,
    private readonly arm: Group,
    private readonly parcel: Group,
    private readonly windowMaterial: MeshStandardMaterial,
    private readonly reducedMotion: boolean,
  ) {
    this.reset();
  }

  start(parcelStart: Vector3) {
    this.reset();
    this.started = true;
    this.parcelStartWorld.copy(parcelStart);
    this.root.updateWorldMatrix(true, true);
    this.parcel.position.copy(this.root.worldToLocal(parcelStart.clone()));
    this.parcel.visible = true;
  }

  reset() {
    this.started = false;
    this.elapsed = 0;
    this.parcelStartWorld.set(0, 0, 0);
    this.hinge.rotation.set(0, 0, 0);
    this.recipient.position.set(0, 0.06, 0.1);
    this.recipient.rotation.set(0, 0, 0);
    this.recipient.scale.setScalar(1);
    this.recipient.visible = false;
    this.arm.rotation.set(0, 0, 0);
    this.parcel.position.set(0, 0, 0);
    this.parcel.rotation.set(0, 0, 0);
    this.parcel.scale.setScalar(1);
    this.parcel.visible = false;
    this.windowMaterial.emissiveIntensity = 0.2;
  }

  snapshot() {
    return {
      active: this.started && this.elapsed < BAY_LEVEL.reactionDuration,
      progress: this.started ? Math.min(1, this.elapsed / BAY_LEVEL.reactionDuration) : 0,
      doorOpen: Math.max(0, -this.hinge.rotation.y / 1.35),
      recipientVisible: this.recipient.visible,
      parcelVisible: this.parcel.visible,
      windowGlow: this.windowMaterial.emissiveIntensity,
    };
  }

  update(dt: number) {
    if (!this.started || this.elapsed >= BAY_LEVEL.reactionDuration || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(BAY_LEVEL.reactionDuration, this.elapsed + dt);
    const smooth = (t: number) => {
      t = MathUtils.clamp(t, 0, 1);
      return t * t * (3 - 2 * t);
    };
    this.hinge.rotation.y = -1.35 * smooth(this.elapsed / 0.65);
    this.windowMaterial.emissiveIntensity = 0.2 + smooth(this.elapsed / 0.8);
    this.recipient.visible = this.elapsed >= 0.2;
    this.recipient.position.z = 0.1 + 0.96 * smooth((this.elapsed - 0.2) / 0.65);
    const wave = smooth((this.elapsed - 0.65) / 0.3);
    this.arm.rotation.z = wave * (this.reducedMotion ? -0.3 : -0.45 + Math.sin((this.elapsed - 0.65) * 11) * 0.36);
    const handoff = smooth((this.elapsed - 0.48) / 1.02);
    this.root.updateWorldMatrix(true, true);
    const destinationWorld = this.recipient.localToWorld(new Vector3(0.08, 0.46, 0.28));
    const positionWorld = this.parcelStartWorld.clone().lerp(destinationWorld, handoff);
    const up = new Vector3(0, 1, 0).transformDirection(this.root.matrixWorld);
    positionWorld.addScaledVector(up, Math.sin(handoff * Math.PI) * (this.reducedMotion ? 0.15 : 0.62));
    this.parcel.position.copy(this.root.worldToLocal(positionWorld));
    this.parcel.rotation.set(
      0,
      this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.55,
      this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.18,
    );
  }
}
