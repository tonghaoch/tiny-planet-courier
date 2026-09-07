import { DeliveryRun, formatTime, readBest } from './game';
import type { Destination } from './math';

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
  private readonly elements = new Map<string, HTMLElement>();

  constructor() {
    this.app.innerHTML = `
      <div class="sky-glow" aria-hidden="true"></div>
      <div id="stage" class="stage"></div>
      <div class="grain" aria-hidden="true"></div>
      <header class="masthead">
        <button class="brand" data-action="home" aria-label="Back to Tiny Planet home">
          <span class="brand-orbit">${icons.planet}</span>
          <span class="brand-type"><strong>Tiny Planet</strong><span>TINY PLANET COURIER</span></span>
        </button>
        <div class="header-center"><span class="live-dot"></span>Interstellar post · Open today</div>
        <div class="header-actions">
          <button class="sound-button" id="sound-button" data-action="sound" aria-label="Enable sound effects" aria-pressed="false">${icons.sound}<span id="sound-label">Sound off</span></button>
          <button class="icon-button pause-button" data-action="pause" aria-label="Pause game">${icons.pause}</button>
          <span class="edition">EXPLORER EDITION <span>01</span></span>
        </div>
      </header>

      <main class="home-view" data-view="home">
        <section class="hero-copy">
          <div class="eyebrow"><span></span>YOUR LITTLE SPACE ADVENTURE</div>
          <h1>Tiny planet.<br>Big <span class="warm-word">heart.</span></h1>
          <p class="hero-description">One tiny planet. Three heartfelt deliveries.<br>Hop in your little van and take the scenic route.</p>
          <button class="start-button" data-action="start"><span class="start-icon">${icons.parcel}</span><span>Start delivering</span>${icons.arrow}</button>
          <p class="start-caption"><span class="tiny-dot"></span>No downloads<span>·</span>No time limit<span>·</span>Just explore</p>
          <div class="trip-ticket">
            <div class="ticket-top"><span>YOUR FIRST ROUTE</span><span class="ticket-stamp">READY TO GO</span></div>
            <div class="ticket-route"><div><span class="route-dot"></span><strong>Mint Planet</strong><small>MINT-01</small></div><span class="dotted-line"></span>${icons.parcel}<div class="ticket-count"><strong>03</strong><small>little surprises</small></div></div>
            <div class="ticket-bottom">Next: Sunrise Bakery<span>Warm croissants ↗</span></div>
          </div>
        </section>
        <div class="planet-note" aria-hidden="true"><span class="note-line"></span><span class="note-cross">+</span><div><span class="note-kicker">A SMALL WORLD, ALL YOURS.</span><strong>Mint Planet <span>MINT-01</span></strong><small>A good day for a little detour.</small></div></div>
        <div class="orbit-label" aria-hidden="true"><span class="live-dot"></span> LIVE PLANET VIEW <span>↗</span></div>
      </main>

      <section class="game-hud" aria-label="Delivery dashboard">
        <div class="mission-card">
          <div class="mission-top"><span>Out for delivery</span><span id="mission-index">01 / 03</span></div>
          <h2 id="mission-name">Sunrise Bakery</h2>
          <p id="mission-parcel">A bag of warm croissants</p>
          <div class="mission-navigation"><span class="direction-disc"><svg id="direction-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 7 17-7-4-7 4Z"/></svg></span><div><strong id="mission-distance">0 m</strong><small id="mission-hint">Take the scenic route</small></div></div>
          <div class="delivery-meter"><span id="delivery-meter"></span></div>
        </div>
        <div class="run-time"><span>Journey time</span><strong id="run-time">00:00</strong></div>
        <div class="driving-console">
          <div class="speed-readout"><strong id="speed">00</strong><div><span>KM/H</span><small>Cruising</small></div></div>
          <span class="console-divider"></span>
          <div class="boost-readout"><div><span>Stardust boost</span><kbd>SPACE</kbd></div><div class="boost-track"><span id="boost-level"></span></div></div>
        </div>
        <div class="delivery-queue"><span>Little missions</span><div id="queue-stops">${[0, 1, 2].map(i => `<span class="queue-stop" data-stop="${i}">${icons.parcel}<span>0${i + 1}</span></span>`).join('<span class="queue-line"></span>')}</div></div>
        <div class="drive-hint"><kbd>W A S D</kbd> Drive<span>·</span><kbd>S</kbd> Brake / Reverse<span>·</span><kbd>R</kbd> Recover<span>·</span><kbd>ESC</kbd> Pause</div>
      </section>

      <div id="target-marker" class="target-marker" hidden><span class="marker-icon">${icons.parcel}</span><span id="marker-label">Sunrise Bakery</span><i></i></div>
      <div class="touch-controls" aria-label="Touch driving controls">
        <div class="touch-steering"><button data-press="left" aria-label="Turn left">←</button><button data-press="right" aria-label="Turn right">→</button></div>
        <div class="touch-pedals"><button data-press="brake" aria-label="Brake and reverse">Brake</button><button data-press="boost" class="touch-boost" aria-label="Boost">✦</button><button data-press="gas" class="touch-gas" aria-label="Drive forward">↑</button></div>
      </div>

      <section class="modal-backdrop" data-view="paused" hidden>
        <div class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <span class="modal-illustration">${icons.planet}</span><span class="eyebrow">TAKE A LITTLE BREAK</span>
          <h2 id="pause-title">The planet can wait.</h2><p>Take a breath. Your parcels and the view will be here.</p>
          <button class="start-button" data-action="resume">Resume journey ${icons.arrow}</button>
          <div class="modal-secondary"><button data-action="restart">Restart delivery</button><button data-action="home">Back to home</button></div>
        </div>
      </section>
      <section class="modal-backdrop" data-view="complete" hidden>
        <div class="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
          <div class="complete-badge">${icons.parcel}<span>✦</span></div><span class="eyebrow">ALL THE LITTLE THINGS, DELIVERED.</span>
          <h2 id="complete-title">All smiles, delivered.</h2><p>Three parcels. Three smiles.<br>You made this little planet's day.</p>
          <div class="result-stats"><div><small>Journey time</small><strong id="result-time">00:00</strong></div><span></span><div><small>Personal best</small><strong id="best-time">—</strong></div></div>
          <span id="record-label" class="record-label">Every trip brings a new view.</span>
          <button class="start-button" data-action="restart">Play again ${icons.arrow}</button>
          <button class="text-button" data-action="home">Back to home</button>
        </div>
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

  private text(id: string, value: string) {
    const element = this.elements.get(id)!;
    if (element.textContent !== value) element.textContent = value;
  }

  setMode(mode: string) {
    if (this.lastMode === mode) return;
    this.lastMode = mode;
    this.app.dataset.mode = mode;
    this.app.querySelectorAll<HTMLElement>('[data-view]').forEach(element => element.hidden = element.dataset.view !== mode);
    this.marker.hidden = true;
    if (mode === 'paused') this.app.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    if (mode === 'complete') this.app.querySelector<HTMLButtonElement>('.complete-modal [data-action="restart"]')?.focus();
    if (mode === 'home') this.app.querySelector<HTMLButtonElement>('[data-action="start"]')?.focus({ preventScroll: true });
  }

  setSound(enabled: boolean) {
    const button = this.elements.get('sound-button')!;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Disable sound effects' : 'Enable sound effects');
    this.text('sound-label', enabled ? 'Sound on' : 'Sound off');
  }

  update(run: DeliveryRun, speed: number, charge: number, distance: number, heading: number) {
    this.setMode(run.mode);
    this.text('run-time', formatTime(run.elapsed));
    this.text('speed', Math.round(Math.abs(speed) * 9).toString().padStart(2, '0'));
    this.elements.get('boost-level')!.style.transform = `scaleX(${charge})`;
    this.elements.get('delivery-meter')!.style.transform = `scaleX(${Math.min(1, run.parkedFor / 0.55)})`;
    if (run.target) {
      this.setTarget(run.target, run.index);
      this.text('mission-distance', `${Math.round(distance * 10)} m`);
      this.text('mission-hint', distance < 1.08 ? (Math.abs(speed) < 1.15 ? 'Parked. Delivering a little joy…' : 'Brake to make your delivery.') : 'Follow the arrow to the glow.');
      this.elements.get('direction-arrow')!.style.transform = `rotate(${heading}rad)`;
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
    this.text('mission-index', `0${index + 1} / 03`);
    this.text('mission-name', target.name);
    this.text('mission-parcel', target.parcel);
    this.text('marker-label', target.name);
  }

  showResults(elapsed: number, newRecord: boolean) {
    clearTimeout(this.toastTimer);
    this.elements.get('toast')!.classList.remove('visible');
    this.text('result-time', formatTime(elapsed, true));
    const best = readBest();
    this.text('best-time', best === null ? '—' : formatTime(best, true));
    this.text('record-label', newRecord ? '✦ A new personal best. Nicely delivered!' : 'Every trip brings a new view.');
    this.setMode('complete');
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
