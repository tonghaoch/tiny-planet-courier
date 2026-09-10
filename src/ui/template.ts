import type { PrototypeDefinition } from '../delivery-prototypes';

const icons = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  planet:
    '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="18" cy="18" r="9.2"/><ellipse cx="18" cy="18" rx="17" ry="5.7" transform="rotate(-32 18 18)"/><path d="m25 5 1-3m4 7 3-1"/></svg>',
  parcel:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5v4"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14M16 5v14"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/></svg>',
};

export function renderUIShell(prototype: PrototypeDefinition | null): string {
  const isPlaytest = prototype !== null && prototype.id !== 'tour';
  return `
      <div class="sky-glow" aria-hidden="true"></div>
      <div id="stage" class="stage"></div>
      <div class="grain" aria-hidden="true"></div>
      <header class="masthead">
        <button class="brand" data-action="home" aria-label="Back to Tiny Planet home">
          <span class="brand-orbit">${icons.planet}</span>
          <span class="brand-type"><strong>Tiny Planet</strong><span>${isPlaytest ? `${prototype.name.toUpperCase()} PLAYTEST` : 'TINY PLANET COURIER'}</span></span>
        </button>
        <div class="header-center"><span class="live-dot"></span>${isPlaytest ? `${prototype.name} · Local playtest` : 'Interstellar post · Open today'}</div>
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
          <div class="welcome-planet-space" aria-hidden="true"></div>
          <button class="start-button" data-action="start"><span class="start-icon">${icons.parcel}</span><span>Start delivering</span>${icons.arrow}</button>
          <p class="start-caption"><span class="tiny-dot"></span>No downloads<span>·</span>No time limit<span>·</span>Just explore</p>
          <div class="trip-ticket">
            <div class="ticket-top"><span>${prototype?.home.ticketHeading ?? 'YOUR FIRST ROUTE'}</span><span class="ticket-stamp">${isPlaytest ? 'PLAYTEST' : 'READY TO GO'}</span></div>
            <div class="ticket-route"><div><span class="route-dot"></span><strong>${prototype?.home.place ?? 'Mint Planet'}</strong><small>${prototype?.home.code ?? 'MINT-01'}</small></div><span class="dotted-line"></span>${icons.parcel}<div class="ticket-count"><strong id="parcel-count">—</strong><small>${prototype?.home.parcelLabel ?? 'little surprises'}</small></div></div>
            <div class="ticket-bottom"><span id="ticket-next">Next: ${prototype?.destinationName ?? 'Sunrise Bakery'}</span><span>${prototype?.home.ticketDetail ?? 'Warm croissants ↗'}</span></div>
          </div>
        </section>
        <div class="planet-note" aria-hidden="true"><span class="note-line"></span><span class="note-cross">+</span><div><span class="note-kicker">A SMALL WORLD, ALL YOURS.</span><strong>Mint Planet <span>MINT-01</span></strong><small>A good day for a little detour.</small></div></div>
        <div class="orbit-label" aria-hidden="true"><span class="live-dot"></span> LIVE PLANET VIEW <span>↗</span></div>
      </main>

      <section class="game-hud" aria-label="Delivery dashboard">
        <section id="navigation-hud" class="navigation-hud" aria-label="Next delivery" aria-live="off" hidden>
          <div class="navigation-destination"><span class="navigation-label">Next stop</span><h2 id="mission-name">${prototype?.destinationName ?? 'Sunrise Bakery'}</h2></div>
          <span class="direction-disc" aria-hidden="true"><svg id="direction-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 7 17-7-4-7 4Z"/></svg><span id="direction-cue" hidden>P</span></span>
          <div class="navigation-distance"><strong id="mission-distance">0 m</strong><span id="mission-index">01 / —</span></div>
          <div class="delivery-meter" aria-hidden="true"><span id="delivery-meter"></span></div>
        </section>
        <div id="mission-context" class="mission-context" hidden>
          <p id="mission-hint">${prototype?.hints.choice ?? 'Take the scenic route'}</p>
          <div class="mission-card">
            <div class="mission-top"><span>Your parcel</span></div>
            <p id="mission-parcel">${prototype?.parcelDescription ?? 'A bag of warm croissants'}</p>
          </div>
        </div>
        <div class="run-time"><span>Journey time</span><strong id="run-time">00:00</strong></div>
        <div class="driving-console">
          <div class="speed-readout"><strong id="speed">00</strong><div><span>KM/H</span><small id="drive-state">Cruising</small></div></div>
          <span class="console-divider"></span>
          <div class="boost-readout"><div><span>Stardust boost</span><kbd>SPACE</kbd></div><div class="boost-track"><span id="boost-level"></span></div></div>
        </div>
        <div class="delivery-queue"><span>${prototype && prototype.id !== 'tour' ? 'One little mission' : 'Little missions'}</span><div id="queue-stops"></div></div>
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
          <h2 id="pause-title">The planet can wait.</h2><p>Take a breath. Your ${isPlaytest ? 'parcel' : 'parcels'} and the view will be here.</p>
          <button class="start-button" data-action="resume">Resume journey ${icons.arrow}</button>
          <div class="modal-secondary"><button data-action="restart">${prototype?.id === 'tour' ? 'Restart tour' : 'Restart delivery'}</button><button data-action="home">Back to home</button></div>
        </div>
      </section>
      <section class="modal-backdrop" data-view="complete" hidden>
        <div class="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
          <div class="complete-badge">${icons.parcel}<span>✦</span></div><span class="eyebrow">ALL THE LITTLE THINGS, DELIVERED.</span>
          <h2 id="complete-title">All smiles, delivered.</h2><p>${isPlaytest ? 'One parcel. One smile.' : 'Three parcels. Three smiles.'}<br>You made this little planet's day.</p>
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
      <section id="tour-result" class="tour-result" aria-label="Tour result" hidden>
        <h2>Three smiles, delivered.</h2>
        <div class="tour-totals"><span>Total <strong id="tour-result-time">00:00</strong></span><span>Best <strong id="tour-best-time">—</strong></span></div>
        <ol id="tour-splits" aria-label="Tour leg splits"></ol>
        <span id="tour-record-label" role="status" aria-live="polite"></span>
        <button class="start-button" data-action="restart">Restart tour ${icons.arrow}</button>
        <small>Keep driving. The road returns to the bay.</small>
      </section>
      <div id="toast" class="toast" role="status" aria-live="polite"><span>${icons.star}</span><div id="toast-message"></div></div>
      <section id="error-panel" class="error-panel" hidden role="alert"><span>${icons.planet}</span><h2>The planet cannot launch yet.</h2><p id="error-message"></p><button class="start-button" data-action="reload">Reload ${icons.arrow}</button></section>
      <footer class="footer home-footer"><span>A LITTLE ESCAPE FROM THE EVERYDAY.</span><div class="footer-controls"><span><kbd>W A S D</kbd> Drive</span><span><kbd>SPACE</kbd> Stardust boost</span></div><span class="made-for">MADE FOR THE WANDERER IN YOU ${icons.star}</span></footer>
    `;
}

export function renderDeliveryQueue(count: number): string {
  return Array.from({ length: count })
    .map(
      (_destination, i) =>
        `<span class="queue-stop" data-stop="${i}">${icons.parcel}<span>${String(i + 1).padStart(2, '0')}</span></span>`,
    )
    .join('<span class="queue-line"></span>');
}
