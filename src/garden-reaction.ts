import { Group, MathUtils, Vector3 } from 'three';
import { GARDEN_LEVEL } from './garden-level';

export class GardenDeliveryReaction {
  private elapsed = 0;
  private started = false;
  private bloom = 0;
  private readonly parcelStart = new Vector3();

  constructor(
    readonly root: Group,
    readonly flowers: Group,
    private readonly recipient: Group,
    private readonly arm: Group,
    private readonly parcel: Group,
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
    this.bloom = 0;
    this.parcelStart.set(0, 0, 0);
    this.recipient.position.set(-0.52, 0.03, 0.78);
    this.recipient.rotation.set(0, 0, 0);
    this.arm.rotation.set(0, 0, 0);
    this.parcel.position.set(0, 0, 0);
    this.parcel.rotation.set(0, 0, 0);
    this.parcel.visible = false;
    this.flowers.children.forEach(plant => plant.scale.setScalar(0.3));
  }

  update(dt: number) {
    if (!this.started || this.elapsed >= GARDEN_LEVEL.reactionDuration || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(GARDEN_LEVEL.reactionDuration, this.elapsed + dt);
    const smooth = (t: number) => { t = MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const approach = smooth((this.elapsed - 0.15) / 0.7);
    this.recipient.position.set(-0.52 + 0.28 * approach, 0.03, 0.78 + 0.34 * approach);
    const wave = smooth((this.elapsed - 0.7) / 0.3);
    this.arm.rotation.z = wave * (this.reducedMotion ? -0.3 : -0.45 + Math.sin((this.elapsed - 0.7) * 9) * 0.25);
    this.bloom = smooth((this.elapsed - 0.85) / 1.35);
    this.flowers.children.forEach(plant => plant.scale.setScalar(0.3 + this.bloom * 0.7));
    const handoff = smooth((this.elapsed - 0.48) / 1.02);
    this.root.updateWorldMatrix(true, true);
    const destination = this.recipient.localToWorld(new Vector3(0.08, 0.46, 0.28));
    const position = this.parcelStart.clone().lerp(destination, handoff);
    const up = new Vector3(0, 1, 0).transformDirection(this.root.matrixWorld);
    position.addScaledVector(up, Math.sin(handoff * Math.PI) * (this.reducedMotion ? 0.15 : 0.62));
    this.parcel.position.copy(this.root.worldToLocal(position));
    this.parcel.rotation.y = this.reducedMotion ? 0 : Math.sin(handoff * Math.PI) * 0.35;
  }

  snapshot() {
    return {
      destination: 'windmill',
      active: this.started && this.elapsed < GARDEN_LEVEL.reactionDuration,
      progress: this.started ? this.elapsed / GARDEN_LEVEL.reactionDuration : 0,
      recipientVisible: this.recipient.visible,
      parcelVisible: this.parcel.visible,
      bloom: this.bloom,
      flowersBloomed: this.bloom === 1,
    };
  }
}
