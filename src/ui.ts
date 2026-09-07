import { DELIVERY_HOLD, DELIVERY_RADIUS, DELIVERY_SPEED, DeliveryRun, formatTime, readBest } from './game';
import type { BayPhase } from './bay-types';
import type { PrototypeDefinition } from './delivery-prototypes';
import type { Destination } from './math';

export interface BayHUDState {
  phase: BayPhase;
  onRamp: boolean;
  onCoastalRoad: boolean;
  nearDestination: boolean;
  route?: 'outer' | 'inner' | null;
}

const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  planet: '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="18" cy="18" r="9.2"/><ellipse cx="18" cy="18" rx="17" ry="5.7" transform="rotate(-32 18 18)"/><path d="m25 5 1-3m4 7 3-1"/></svg>',
  parcel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5v4"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14M16 5v14"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/></svg>',
};

export class UI {
  readonly app = document.querySelector<HTMLDivElement>('#app')!;
  readonly stage: HTMLDivElement;
  readonly marker: HTMLDivElement;
  onAction: (action: string) => void = () => {};
  private toastTimer = 0;
  private targetId = '';
  private lastMode = '';
  private deliveryCount = 0;
  private prototypeResultReady = false;
  private soundEnabled = false;
  private readonly elements = new Map<string, HTMLElement>();

  get bayPrototype() { return this.prototype?.id === 'bay'; }

  constructor(readonly prototype: PrototypeDefinition | null = null) {
    this.app.dataset.prototype = prototype?.id ?? 'standard';
    this.app.innerHTML = `
      <div class="sky-glow" aria-hidden="true"></div>
      <div id="stage" class="stage"></div>
      <div class="grain" aria-hidden="true"></div>
      <header class="masthead">
        <button class="brand" data-action="home" aria-label="Back to Tiny Planet home">
          <span class="brand-orbit">${icons.planet}</span>
          <span class="brand-type"><strong>Tiny Planet</strong><span>${prototype ? `${prototype.name.toUpperCase()} PLAYTEST` : 'TINY PLANET COURIER'}</span></span>
        </button>
        <div class="header-center"><span class="live-dot"></span>${prototype ? `${prototype.name} · Local playtest` : 'Interstellar post · Open today'}</div>
        <div class="header-actions">
          <button class="sound-button" id="sound-button" data-action="sound" aria-label="Enable sound effects" aria-pressed="false">${icons.sound}<span id="sound-label">Sound off</span></button>
          <button class="icon-button pause-button" data-action="pause" aria-label="Pause game">${icons.pause}</button>
          <span class="edition">EXPLORER EDITION <span>01</span></span>
        </div>
      </header>

      <main class="home-view" data-view="home">
        <section class="hero-copy">
          <div class="eyebrow"><span></span>${prototype?.home.eyebrow ?? 'YOUR LITTLE SPACE ADVENTURE'}</div>
          <h1>${prototype?.home.title ?? 'Tiny planet.<br>Big <span class="warm-word">heart.</span>'}</h1>
          <p class="hero-description">${prototype?.home.description ?? 'One tiny planet. Three heartfelt deliveries.<br>Hop in your little van and take the scenic route.'}</p>
          <button class="start-button" data-action="start"><span class="start-icon">${icons.parcel}</span><span>Start delivering</span>${icons.arrow}</button>
          <p class="start-caption"><span class="tiny-dot"></span>No downloads<span>·</span>No time limit<span>·</span>Just explore</p>
          <div class="trip-ticket">
            <div class="ticket-top"><span>${prototype?.home.ticketHeading ?? 'YOUR FIRST ROUTE'}</span><span class="ticket-stamp">${prototype ? 'PLAYTEST' : 'READY TO GO'}</span></div>
            <div class="ticket-route"><div><span class="route-dot"></span><strong>${prototype?.home.place ?? 'Mint Planet'}</strong><small>${prototype?.home.code ?? 'MINT-01'}</small></div><span class="dotted-line"></span>${icons.parcel}<div class="ticket-count"><strong id="parcel-count">—</strong><small>${prototype?.home.parcelLabel ?? 'little surprises'}</small></div></div>
            <div class="ticket-bottom"><span id="ticket-next">Next: ${prototype?.destinationName ?? 'Sunrise Bakery'}</span><span>${prototype?.home.ticketDetail ?? 'Warm croissants ↗'}</span></div>
          </div>
        </section>
        <div class="planet-note" aria-hidden="true"><span class="note-line"></span><span class="note-cross">+</span><div><span class="note-kicker">A SMALL WORLD, ALL YOURS.</span><strong>Mint Planet <span>MINT-01</span></strong><small>A good day for a little detour.</small></div></div>
        <div class="orbit-label" aria-hidden="true"><span class="live-dot"></span> LIVE PLANET VIEW <span>↗</span></div>
      </main>

      <section class="game-hud" aria-label="Delivery dashboard">
        <div class="mission-card">
          <div class="mission-top"><span>Out for delivery</span><span id="mission-index">01 / —</span></div>
          <h2 id="mission-name">${prototype?.destinationName ?? 'Sunrise Bakery'}</h2>
          <p id="mission-parcel">${prototype?.parcelDescription ?? 'A bag of warm croissants'}</p>
          <div class="mission-navigation"><span class="direction-disc"><svg id="direction-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 7 17-7-4-7 4Z"/></svg></span><div><strong id="mission-distance">0 m</strong><small id="mission-hint">${prototype?.hints.choice ?? 'Take the scenic route'}</small></div></div>
          <div class="delivery-meter"><span id="delivery-meter"></span></div>
        </div>
        <div class="run-time"><span>Journey time</span><strong id="run-time">00:00</strong></div>
        <div class="driving-console">
          <div class="speed-readout"><strong id="speed">00</strong><div><span>KM/H</span><small id="drive-state">Cruising</small></div></div>
          <span class="console-divider"></span>
          <div class="boost-readout"><div><span>Stardust boost</span><kbd>SPACE</kbd></div><div class="boost-track"><span id="boost-level"></span></div></div>
        </div>
        <div class="delivery-queue"><span>${prototype ? 'One little mission' : 'Little missions'}</span><div id="queue-stops"></div></div>
        <div class="drive-hint"><kbd>W A S D</kbd> Drive<span>·</span><kbd>S</kbd> Brake / Reverse<span>·</span><kbd>R</kbd> Recover<span>·</span><kbd>ESC</kbd> Pause</div>
      </section>

      <div id="target-marker" class="target-marker" hidden><span class="marker-icon">${icons.parcel}</span><span id="marker-label">${prototype?.destinationName ?? 'Sunrise Bakery'}</span><i></i></div>
      <div class="touch-controls" aria-label="Touch driving controls">
        <div class="touch-steering"><button data-press="left" aria-label="Turn left">←</button><button data-press="right" aria-label="Turn right">→</button></div>
        <div class="touch-pedals"><button data-press="brake" aria-label="Brake and reverse">Brake</button><button data-press="boost" class="touch-boost" aria-label="Boost">✦</button><button data-press="gas" class="touch-gas" aria-label="Drive forward">↑</button></div>
      </div>

      <section class="modal-backdrop" data-view="paused" hidden>
        <div class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <span class="modal-illustration">${icons.planet}</span><span class="eyebrow">TAKE A LITTLE BREAK</span>
          <h2 id="pause-title">The planet can wait.</h2><p>Take a breath. Your ${prototype ? 'parcel' : 'parcels'} and the view will be here.</p>
          <button class="start-button" data-action="resume">Resume journey ${icons.arrow}</button>
          <div class="modal-secondary"><button data-action="restart">Restart delivery</button><button data-action="home">Back to home</button></div>
        </div>
      </section>
      <section class="modal-backdrop" data-view="complete" hidden>
        <div class="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
          <div class="complete-badge">${icons.parcel}<span>✦</span></div><span class="eyebrow">ALL THE LITTLE THINGS, DELIVERED.</span>
          <h2 id="complete-title">All smiles, delivered.</h2><p>${prototype ? 'One parcel. One smile.' : 'Three parcels. Three smiles.'}<br>You made this little planet's day.</p>
          <div class="result-stats"><div><small>Journey time</small><strong id="result-time">00:00</strong></div><span></span><div><small>Personal best</small><strong id="best-time">—</strong></div></div>
          <span id="record-label" class="record-label">Every trip brings a new view.</span>
          <button class="start-button" data-action="restart">Play again ${icons.arrow}</button>
          <button class="text-button" data-action="home">Back to home</button>
        </div>
      </section>
      <section id="bay-result" class="bay-result" aria-label="${prototype?.id === 'garden' ? 'Garden' : prototype?.id === 'station' ? 'Station' : 'Bay'} delivery result" hidden>
        <div class="bay-result-top">${icons.parcel}<span>ONE LITTLE JOY, DELIVERED</span></div>
        <h2>${prototype?.result.heading ?? 'Good morning,<br>Sunrise Bakery.'}</h2>
        <p>${prototype?.result.description ?? 'The parcel is home. Stay for the view.'}</p>
        <div class="bay-result-times"><div><small>This trip</small><strong id="bay-result-time">00:00</strong></div><div><small>${prototype?.result.bestLabel ?? 'Bay best'}</small><strong id="bay-best-time">—</strong></div></div>
        <span id="bay-record-label" class="bay-record-label" role="status" aria-live="polite"></span>
        <button class="start-button" data-action="restart">Try another route ${icons.arrow}</button>
        <small class="bay-result-caption">Keep driving, or take another lap.</small>
      </section>
      <div id="toast" class="toast" role="status" aria-live="polite"><span>${icons.star}</span><div id="toast-message"></div></div>
      <section id="error-panel" class="error-panel" hidden role="alert"><span>${icons.planet}</span><h2>The planet cannot launch yet.</h2><p id="error-message"></p><button class="start-button" data-action="reload">Reload ${icons.arrow}</button></section>
      <footer class="footer home-footer"><span>A LITTLE ESCAPE FROM THE EVERYDAY.</span><div class="footer-controls"><span><kbd>W A S D</kbd> Drive</span><span><kbd>SPACE</kbd> Stardust boost</span></div><span class="made-for">MADE FOR THE WANDERER IN YOU ${icons.star}</span></footer>
    `;
    this.stage = this.app.querySelector('#stage')!;
    this.marker = this.app.querySelector('#target-marker')!;
    this.app.querySelectorAll<HTMLElement>('[id]').forEach(element => this.elements.set(element.id, element));
    this.app.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) this.onAction(button.dataset.action!);
    });
    this.setMode('home');
  }

  setDestinations(destinations: Destination[]) {
    this.deliveryCount = destinations.length;
    this.targetId = '';
    this.text('parcel-count', String(this.deliveryCount).padStart(2, '0'));
    this.elements.get('queue-stops')!.innerHTML = destinations.map((_destination, i) => `<span class="queue-stop" data-stop="${i}">${icons.parcel}<span>${String(i + 1).padStart(2, '0')}</span></span>`).join('<span class="queue-line"></span>');
    if (destinations[0]) {
      this.text('ticket-next', `Next: ${destinations[0].name}`);
      this.setTarget(destinations[0], 0);
    }
  }

  resetJourney() {
    this.prototypeResultReady = false;
    this.targetId = '';
    this.app.dataset.delivered = 'false';
    this.elements.get('bay-result')!.hidden = true;
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
    this.elements.get('bay-result')!.hidden = !this.prototypeResultReady || mode !== 'playing';
    this.app.querySelectorAll<HTMLElement>('[data-view]').forEach(element => element.hidden = element.dataset.view !== mode);
    this.marker.hidden = true;
    if (mode === 'paused') this.app.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    if (mode === 'complete') this.app.querySelector<HTMLButtonElement>('.complete-modal [data-action="restart"]')?.focus();
    if (mode === 'home') this.app.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
  }

  setSound(enabled: boolean) {
    if (enabled === this.soundEnabled) return;
    this.soundEnabled = enabled;
    const button = this.elements.get('sound-button')!;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Disable sound effects' : 'Enable sound effects');
    this.text('sound-label', enabled ? 'Sound on' : 'Sound off');
  }

  update(run: DeliveryRun, speed: number, charge: number, distance: number, heading: number, driveState?: BayHUDState) {
    this.setMode(run.mode);
    this.text('run-time', formatTime(run.elapsed));
    this.text('speed', Math.round(Math.abs(speed) * 9).toString().padStart(2, '0'));
    this.elements.get('boost-level')!.style.transform = `scaleX(${charge})`;
    this.elements.get('delivery-meter')!.style.transform = `scaleX(${Math.min(1, run.parkedFor / DELIVERY_HOLD)})`;
    if (run.target) {
      this.setTarget(run.target, run.index);
      this.text('mission-distance', `${Math.round(distance * 10)} m`);
      let hint = distance < DELIVERY_RADIUS ? (Math.abs(speed) < DELIVERY_SPEED ? 'Parked. Delivering a little joy…' : 'Brake to make your delivery.') : 'Follow the arrow to the glow.';
      if (this.prototype?.id === 'station' || this.prototype?.id === 'garden') {
        if (driveState?.phase === 'recovering') hint = this.prototype.hints.recovery;
        else if (distance >= DELIVERY_RADIUS) {
          const nearDestination = driveState?.nearDestination ?? distance < 2.6;
          hint = nearDestination ? this.prototype.hints.nearDestination
            : driveState?.route === 'outer' ? this.prototype.hints.outer
            : driveState?.route === 'inner' ? this.prototype.hints.inner
            : this.prototype.hints.choice;
        }
      } else if (this.prototype && driveState) {
        if (driveState.phase === 'recovering') hint = 'Back to the fork. Your parcel is safe.';
        else if (driveState.phase === 'airborne') hint = 'A little steer. Aim for the sand.';
        else if (driveState.onRamp) hint = this.prototype.hints.inner;
        else if (distance >= DELIVERY_RADIUS) hint = driveState.nearDestination ? this.prototype.hints.nearDestination : driveState.onCoastalRoad ? this.prototype.hints.outer : this.prototype.hints.choice;
      }
      this.text('mission-hint', hint);
      this.elements.get('direction-arrow')!.style.transform = `rotate(${heading}rad)`;
    } else if (this.prototype && run.finished) this.text('mission-hint', 'Handing over a little joy…');
    if (this.prototype && driveState) {
      const driveLabel = driveState.phase === 'recovering' ? 'A fresh start'
        : this.bayPrototype && driveState.phase === 'airborne' ? 'Airborne'
        : this.bayPrototype && driveState.onRamp ? 'Ready to leap'
        : this.prototype.id === 'station' && driveState.route === 'inner' ? 'Tight turns'
        : this.prototype.id === 'station' && driveState.route === 'outer' ? 'Outer road'
        : this.prototype.id === 'garden' && driveState.route === 'inner' ? 'Flower path'
        : this.prototype.id === 'garden' && driveState.route === 'outer' ? 'Garden loop' : 'Cruising';
      this.text('drive-state', driveLabel);
    }
    this.app.querySelectorAll<HTMLElement>('[data-stop]').forEach(stop => {
      const index = Number(stop.dataset.stop);
      stop.classList.toggle('is-done', index < run.index);
      stop.classList.toggle('is-current', index === run.index);
    });
  }

  private setTarget(target: Destination, index: number) {
    if (this.targetId === `${target.id}:${index}`) return;
    this.targetId = `${target.id}:${index}`;
    this.text('mission-index', `${String(index + 1).padStart(2, '0')} / ${String(this.deliveryCount).padStart(2, '0')}`);
    this.text('mission-name', target.name);
    this.text('mission-parcel', target.parcel);
    this.text('marker-label', target.name);
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
    if (!this.prototype) return;
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

  toast(message: string) {
    this.text('toast-message', message);
    const toast = this.elements.get('toast')!;
    toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  showError(message: string) {
    this.text('error-message', message);
    this.elements.get('error-panel')!.hidden = false;
    this.app.classList.add('has-error');
  }
}
