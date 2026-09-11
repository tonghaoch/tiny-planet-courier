import { renderDeliveryQueue, renderUIShell } from './ui/template';
import { DELIVERY_HOLD, DeliveryRun, formatTime, readBest } from './game';
import { missionHint, driveStateLabel, type BayHUDState } from './ui/hints';
import type { PrototypeDefinition } from './delivery-prototypes';
import type { TourSplit } from './tour-session';
import type { Destination } from './math';
import { advanceNavigationHeading, arrivalActive, type GuidanceMode } from './navigation-presentation';
export { unwrapNavigationHeading } from './navigation-presentation';

export type { BayHUDState } from './ui/hints';

interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class UI {
  readonly app = document.querySelector<HTMLDivElement>('#app')!;
  readonly stage: HTMLDivElement;
  readonly marker: HTMLDivElement;
  onAction: (action: string) => void = () => {};
  private toastTimer = 0;
  private targetId = '';
  private lastMode = '';
  private deliveryCount = 0;
  private destinations: readonly Destination[] = [];
  private prototypeResultReady = false;
  private soundEnabled = false;
  private readonly elements = new Map<string, HTMLElement>();
  private visualHeading: number | null = null;
  private commandedHeading: number | null = null;
  private guidanceMode: GuidanceMode = 'hidden';
  private arrival = false;
  private readonly motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  private hasTarget = false;
  private geometryFrame = 0;
  private markerSize = { width: 0, height: 0 };
  private labelObstacles: ScreenRect[] = [];
  private welcomeFrame = { x: 0, y: 0, diameter: 0 };

  get bayPrototype() {
    return this.prototype?.id === 'bay';
  }

  constructor(readonly prototype: PrototypeDefinition | null = null) {
    this.app.dataset.prototype = prototype?.id ?? 'standard';
    this.app.innerHTML = renderUIShell(prototype);
    this.stage = this.app.querySelector('#stage')!;
    this.marker = this.app.querySelector('#target-marker')!;
    this.app.querySelectorAll<HTMLElement>('[id]').forEach(element => this.elements.set(element.id, element));
    this.app.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) this.onAction(button.dataset.action!);
    });
    const disclosure = this.app.querySelector<HTMLDetailsElement>('#tour-details');
    disclosure?.addEventListener('toggle', () => this.invalidateGeometry());
    disclosure?.addEventListener('keydown', event => {
      // Preserve native disclosure/scroll keys without feeding them to driving input.
      if (
        (event.target instanceof HTMLElement &&
          event.target.tagName === 'SUMMARY' &&
          ['Space', 'Enter'].includes(event.code)) ||
        (event.target === this.elements.get('tour-splits') &&
          ['Space', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.code))
      )
        event.stopPropagation();
    });
    const geometryObserver = new ResizeObserver(() => this.invalidateGeometry());
    this.app
      .querySelectorAll<HTMLElement>(
        '.masthead, .hero-copy, .hero-description, .hero-copy > .start-button, .navigation-hud, .mission-context, #mission-hint, .mission-card, .run-time, .touch-controls, .driving-console, .delivery-queue, .drive-hint, .toast, .bay-result, .tour-result',
      )
      .forEach(element => geometryObserver.observe(element));
    window.addEventListener('resize', () => this.invalidateGeometry());
    this.app
      .querySelector('.home-view')!
      .addEventListener('scroll', () => this.invalidateGeometry(), { passive: true });
    document.fonts.ready.then(() => this.invalidateGeometry());
    this.motionPreference.addEventListener('change', () => {
      if (this.motionPreference.matches && this.commandedHeading !== null) {
        this.visualHeading = this.commandedHeading;
        this.paintHeading();
      }
    });
    this.setMode('home');
  }

  /** Passive presentation diagnostics, with no navigation selection or layout reads. */
  getNavigationPresentation() {
    return {
      mode: this.lastMode === 'playing' && this.hasTarget ? this.guidanceMode : ('hidden' as GuidanceMode),
      commandedHeading: this.commandedHeading,
      displayedHeading: this.visualHeading,
      arrival: this.arrival,
    };
  }

  /** Snap the next command after a discontinuous pose or target reset. */
  resetNavigationPresentation() {
    this.arrival = false;
    this.visualHeading = null;
    this.commandedHeading = null;
    this.guidanceMode = 'hidden';
    this.elements.get('direction-arrow')!.toggleAttribute('hidden', true);
    this.elements.get('direction-cue')!.hidden = true;
  }

  /** Called by the existing render tick; pause freezes the rendered angle. */
  advanceNavigation(dt: number) {
    if (this.lastMode !== 'playing' || this.guidanceMode !== 'steering' || this.commandedHeading === null) return;
    this.visualHeading = advanceNavigationHeading(
      this.visualHeading,
      this.commandedHeading,
      dt,
      this.motionPreference.matches,
    );
    this.paintHeading();
  }

  private paintHeading() {
    if (this.visualHeading !== null)
      this.elements.get('direction-arrow')!.style.transform = `rotate(${this.visualHeading}rad)`;
  }

  /** Cached welcome-only planet slot; no layout read in the render loop. */
  getWelcomeFrame() {
    return this.welcomeFrame;
  }

  /** The world beacon stays intact; only its duplicated text yields to screen UI. */
  canShowTargetLabel(x: number, y: number) {
    const rect = {
      left: x - this.markerSize.width / 2,
      right: x + this.markerSize.width / 2,
      top: y - this.markerSize.height,
      bottom: y + 16,
    };
    return (
      this.lastMode === 'playing' &&
      this.hasTarget &&
      !this.app.classList.contains('has-error') &&
      rect.left >= 8 &&
      rect.right <= window.innerWidth - 8 &&
      !this.labelObstacles.some(
        other =>
          rect.left < other.right + 8 &&
          rect.right > other.left - 8 &&
          rect.top < other.bottom + 8 &&
          rect.bottom > other.top - 8,
      )
    );
  }

  private invalidateGeometry() {
    if (this.geometryFrame) return;
    this.geometryFrame = requestAnimationFrame(() => {
      this.geometryFrame = 0;
      const width = window.innerWidth,
        height = window.innerHeight;
      if (this.lastMode === 'home') {
        const hero = this.app.querySelector('.hero-copy')!.getBoundingClientRect();
        const description = this.app.querySelector('.hero-description')!.getBoundingClientRect();
        const button = this.app.querySelector('.hero-copy > .start-button')!.getBoundingClientRect();
        const portrait = width / height < 0.94;
        this.welcomeFrame = portrait
          ? {
              x: width / 2,
              y: (description.bottom + button.top) / 2,
              diameter: Math.max(80, Math.min(width * 0.8, button.top - description.bottom - 24)),
            }
          : {
              x: (hero.right + width) / 2,
              y: height * 0.51,
              diameter: Math.min((width - hero.right) * 0.88, height * 0.68),
            };
      }
      const navigation = this.elements.get('navigation-hud')!;
      const navigationRect = navigation.getBoundingClientRect();
      const context = this.elements.get('mission-context')!;
      const toast = this.elements.get('toast')!;
      const masthead = this.app.querySelector('.masthead')!.getBoundingClientRect();
      const bottom = navigation.hidden ? masthead.bottom : navigationRect.bottom;
      // Place overlays one-way: navigation bounds position the context, then the
      // context's non-transitioning bounds position the toast.
      context.style.setProperty('--navigation-bottom', `${bottom}px`);
      context.style.setProperty('--navigation-top', `${navigationRect.top}px`);
      context.style.setProperty('--navigation-left', `${navigationRect.left}px`);
      const contextBounds = [context, ...context.querySelectorAll<HTMLElement>('#mission-hint, .mission-card')]
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width && rect.height);
      let contextBottom = navigation.hidden
        ? masthead.bottom
        : Math.max(...contextBounds.map(rect => rect.bottom), navigationRect.top);
      toast.style.setProperty('--navigation-left', `${navigation.hidden ? width : navigationRect.left}px`);
      toast.style.setProperty('--context-bottom', `${contextBottom}px`);
      if (navigation.hidden && !(width >= 761 && height <= 500)) {
        // Completion notices remain visible outside the hidden navigation. Start
        // below the masthead, yielding to results only when they occupy this slot.
        const toastRect = toast.getBoundingClientRect();
        for (const result of this.app.querySelectorAll<HTMLElement>('.bay-result, .tour-result')) {
          const rect = result.getBoundingClientRect();
          if (
            rect.width &&
            rect.height &&
            toastRect.left < rect.right &&
            toastRect.right > rect.left &&
            contextBottom + 12 < rect.bottom &&
            contextBottom + 12 + toastRect.height > rect.top - 12
          ) {
            contextBottom = rect.bottom;
          }
        }
        toast.style.setProperty('--context-bottom', `${contextBottom}px`);
      }
      this.labelObstacles = [];
      this.app
        .querySelectorAll<HTMLElement>(
          '.masthead, .navigation-hud, .mission-context, #mission-hint, .mission-card, .run-time, .touch-controls, .driving-console, .delivery-queue, .drive-hint, .toast.visible, .bay-result, .tour-result',
        )
        .forEach(element => {
          const rect = element.getBoundingClientRect();
          if (rect.width && rect.height) this.labelObstacles.push(rect);
        });
      // Measure only when invalidated, even if the projected label is currently hidden.
      const hidden = this.marker.hidden;
      this.marker.style.visibility = 'hidden';
      this.marker.hidden = false;
      const marker = this.marker.getBoundingClientRect();
      this.markerSize = { width: marker.width, height: marker.height };
      this.marker.hidden = hidden;
      this.marker.style.visibility = '';
    });
  }

  private syncNavigationVisibility() {
    const hidden = this.lastMode !== 'playing' || !this.hasTarget || this.app.classList.contains('has-error');
    this.elements.get('navigation-hud')!.hidden = hidden;
    this.elements.get('mission-context')!.hidden = hidden;
    this.invalidateGeometry();
  }

  setDestinations(destinations: Destination[]) {
    this.destinations = destinations.slice();
    this.deliveryCount = destinations.length;
    this.hasTarget = destinations.length > 0;
    this.syncNavigationVisibility();
    this.targetId = '';
    this.text('parcel-count', String(this.deliveryCount).padStart(2, '0'));
    this.elements.get('queue-stops')!.innerHTML = renderDeliveryQueue(destinations.length);
    if (destinations[0]) {
      this.text('ticket-next', `Next: ${destinations[0].name}`);
      this.setTarget(destinations[0], 0);
    }
  }

  resetJourney() {
    this.prototypeResultReady = false;
    this.targetId = '';
    this.resetNavigationPresentation();
    this.hasTarget = false;
    this.syncNavigationVisibility();
    this.app.dataset.delivered = 'false';
    this.elements.get('bay-result')!.hidden = true;
    this.elements.get('tour-result')!.hidden = true;
    this.elements.get('tour-splits')!.replaceChildren();
    this.elements.get('tour-details')?.removeAttribute('open');
    clearTimeout(this.toastTimer);
    this.elements.get('toast')!.classList.remove('visible');
  }

  private text(id: string, value: string) {
    const element = this.elements.get(id)!;
    if (element.textContent !== value) element.textContent = value;
  }

  setMode(mode: string) {
    if (this.lastMode === mode) return;
    this.lastMode = mode;
    this.app.dataset.mode = mode;
    this.syncNavigationVisibility();
    this.elements.get('bay-result')!.hidden =
      this.prototype?.id === 'tour' || !this.prototypeResultReady || mode !== 'playing';
    this.elements.get('tour-result')!.hidden =
      this.prototype?.id !== 'tour' || !this.prototypeResultReady || mode !== 'playing';
    this.app
      .querySelectorAll<HTMLElement>('[data-view]')
      .forEach(element => (element.hidden = element.dataset.view !== mode));
    this.marker.hidden = true;
    if (mode === 'paused') this.app.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    if (mode === 'complete')
      this.app.querySelector<HTMLButtonElement>('.complete-modal [data-action="restart"]')?.focus();
    if (mode === 'home')
      this.app.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
  }

  setSound(enabled: boolean) {
    if (enabled === this.soundEnabled) return;
    this.soundEnabled = enabled;
    const button = this.elements.get('sound-button')!;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Disable sound effects' : 'Enable sound effects');
    this.text('sound-label', enabled ? 'Sound on' : 'Sound off');
  }

  update(
    run: DeliveryRun,
    speed: number,
    charge: number,
    distance: number,
    heading: number | null,
    driveState?: BayHUDState,
  ) {
    this.setMode(run.mode);
    if (this.hasTarget !== Boolean(run.target)) {
      this.hasTarget = Boolean(run.target);
      this.syncNavigationVisibility();
    }
    this.text('run-time', formatTime(run.elapsed));
    this.text(
      'speed',
      Math.round(Math.abs(speed) * 9)
        .toString()
        .padStart(2, '0'),
    );
    this.elements.get('boost-level')!.style.transform = `scaleX(${charge})`;
    this.elements.get('delivery-meter')!.style.transform = `scaleX(${Math.min(1, run.parkedFor / DELIVERY_HOLD)})`;
    if (run.target) {
      this.setTarget(run.target, run.index);
      this.text('mission-distance', `${Math.round(distance * 10)} m`);
      const recovering = driveState?.phase === 'recovering';
      const grounded = driveState?.grounded ?? (driveState ? driveState.phase === 'grounded' : false);
      this.arrival = !recovering && arrivalActive(this.arrival, distance, grounded);
      const nextMode: GuidanceMode = recovering
        ? 'recovering'
        : this.arrival
          ? 'parking'
          : heading === null
            ? 'hidden'
            : 'steering';
      if (nextMode !== this.guidanceMode) this.visualHeading = null;
      this.guidanceMode = nextMode;
      this.commandedHeading = nextMode === 'steering' ? heading : null;
      this.elements.get('navigation-hud')!.dataset.guidance = nextMode;
      this.elements.get('direction-arrow')!.toggleAttribute('hidden', nextMode !== 'steering');
      this.elements.get('direction-cue')!.hidden = nextMode !== 'parking' && nextMode !== 'recovering';
      this.text('direction-cue', nextMode === 'recovering' ? '···' : 'P');
      this.text(
        'mission-hint',
        missionHint({
          prototype: this.prototype,
          targetName: run.target.name,
          distance,
          speed,
          heading,
          arrival: this.arrival,
          driveState,
        }),
      );
      if (this.commandedHeading !== null && (this.visualHeading === null || this.motionPreference.matches)) {
        this.visualHeading = this.commandedHeading;
        this.paintHeading();
      }
    } else {
      this.resetNavigationPresentation();
      if (this.prototype && run.finished)
        this.text(
          'mission-hint',
          this.prototype.id === 'tour' ? 'All delivered. Keep exploring.' : 'Handing over a little joy…',
        );
    }
    const driveLabel = driveStateLabel(this.prototype, driveState);
    if (driveLabel !== null) this.text('drive-state', driveLabel);
    this.app.querySelectorAll<HTMLElement>('[data-stop]').forEach(stop => {
      const index = Number(stop.dataset.stop);
      stop.classList.toggle('is-done', index < run.index);
      stop.classList.toggle('is-current', index === run.index);
    });
  }

  private setTarget(target: Destination, index: number) {
    if (this.targetId === `${target.id}:${index}`) return;
    this.targetId = `${target.id}:${index}`;
    this.resetNavigationPresentation();
    this.text(
      'mission-index',
      `${String(index + 1).padStart(2, '0')} / ${String(this.deliveryCount).padStart(2, '0')}`,
    );
    this.text('mission-name', target.name);
    this.text('mission-parcel', target.parcel);
    this.text('marker-label', target.name);
    this.invalidateGeometry();
  }

  showResults(elapsed: number, newRecord: boolean) {
    if (this.prototype) {
      this.showPrototypeResults(elapsed, newRecord);
      return;
    }
    clearTimeout(this.toastTimer);
    this.elements.get('toast')!.classList.remove('visible');
    this.text('result-time', formatTime(elapsed, true));
    const best = readBest();
    this.text('best-time', best === null ? '—' : formatTime(best, true));
    this.text('record-label', newRecord ? '✦ A new personal best. Nicely delivered!' : 'Every trip brings a new view.');
    this.setMode('complete');
  }

  showBayResults(elapsed: number, newRecord: boolean) {
    this.showResults(elapsed, newRecord);
  }

  private showPrototypeResults(elapsed: number, newRecord: boolean) {
    if (!this.prototype || this.prototype.id === 'tour') return;
    this.prototypeResultReady = true;
    this.app.dataset.delivered = 'true';
    clearTimeout(this.toastTimer);
    this.elements.get('toast')!.classList.remove('visible');
    this.text('bay-result-time', formatTime(elapsed, true));
    const best = readBest(this.prototype.bestScoreKey);
    this.text('bay-best-time', best === null ? '—' : formatTime(best, true));
    this.text('bay-record-label', newRecord ? this.prototype.result.newRecord : this.prototype.result.delivered);
    this.elements.get('bay-result')!.hidden = this.lastMode !== 'playing';
  }

  /** Nonblocking: use the session's completed splits, never an independent UI timer. */
  showTourResults(elapsed: number, splits: readonly TourSplit[], newRecord: boolean, recordKey: string) {
    if (this.prototype?.id !== 'tour') return;
    this.prototypeResultReady = true;
    this.app.dataset.delivered = 'true';
    clearTimeout(this.toastTimer);
    this.elements.get('toast')!.classList.remove('visible');
    this.text('tour-result-time', formatTime(elapsed, true));
    const best = readBest(recordKey);
    this.elements.get('tour-details')?.removeAttribute('open');
    this.text('tour-best-time', best === null ? '—' : formatTime(best, true));
    this.elements.get('tour-splits')!.replaceChildren(
      ...splits.map(split => {
        const row = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${String(split.index + 1).padStart(2, '0')} · ${this.destinations[split.index].name}`;
        const time = document.createElement('strong');
        time.textContent = formatTime(split.elapsed, true);
        row.append(name, time);
        return row;
      }),
    );
    this.text('tour-record-label', newRecord ? this.prototype.result.newRecord : this.prototype.result.delivered);
    this.elements.get('tour-result')!.hidden = this.lastMode !== 'playing';
    this.invalidateGeometry();
  }

  toast(message: string) {
    this.text('toast-message', message);
    const toast = this.elements.get('toast')!;
    toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.invalidateGeometry();
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('visible');
      this.invalidateGeometry();
    }, 3600);
  }

  showError(message: string) {
    this.text('error-message', message);
    this.elements.get('error-panel')!.hidden = false;
    this.app.classList.add('has-error');
    this.syncNavigationVisibility();
    this.marker.hidden = true;
  }
}
