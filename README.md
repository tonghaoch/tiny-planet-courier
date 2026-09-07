<div align="center">
  <h1>🪐 Tiny Planet Courier</h1>
  <p><strong>A tiny planet. Three deliveries. One lovely little escape.</strong></p>
  <p>Take the scenic route in a cozy, low-poly 3D browser game.</p>
  <p>
    <a href="#run-locally"><strong>Play locally</strong></a>
    &nbsp;·&nbsp;
    <a href="#how-to-play">Controls</a>
    &nbsp;·&nbsp;
    <a href="#build-and-test">Build &amp; test</a>
  </p>
  <img src="docs/screenshots/planet-overview.jpg" alt="Tiny Planet Courier's home screen: a mint-green toy planet with winding roads, pastel houses, a windmill, and a delivery van floating against a starry sky." width="1120" />
  <p><sub>Welcome to Mint Planet. A small world, all yours.</sub></p>
</div>

### The scenic route is the whole point.

Hop into your little van and bring a bit of joy to **Sunrise Bakery**, **Stargaze Station**, and **Windmill Garden**. Follow the glowing mailboxes, take a detour, or give your engine a little stardust boost. There is no countdown to beat—just three parcels and a planet worth exploring.

- **A whole world in miniature.** Curving roads, drifting clouds, tiny houses, and a horizon that follows you around.
- **Small deliveries, zero rush.** Park in the glow to hand over a parcel. Finish your route, enjoy the view, and try another lap.
- **One link, no installation for players.** Runs in a WebGL 2 browser with keyboard or touch controls. No account or backend required.

<p align="center">
  <img src="docs/screenshots/delivery-run.jpg" alt="Gameplay from behind the delivery van, following a curved road toward the glowing Sunrise Bakery delivery marker, with a mission panel and speed display." width="880" />
  <br />
  <sub>Next stop: Sunrise Bakery. The croissants are still warm.</sub>
</p>

> **Ready for a little escape?** [Run it locally](#run-locally), or build it and host the static files to share your own playable link.

---

## Run locally

Requires Node.js 20.19+ or 22.12+ (verified with Node.js 24).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal, usually **http://127.0.0.1:5173**. The development server only listens on your computer by default. The game has touch controls and a mobile layout, but accessing your computer's development server from a phone requires configuring access over a trusted local network.

## How to play

| Action | Controls |
| --- | --- |
| Drive forward | W / ↑ |
| Steer left or right | A, D / ←, → |
| Brake, then reverse | S / ↓ |
| Stardust boost | Hold Space; uses energy that recharges when released |
| Recover the van and stop | R |
| Pause / resume | Esc |

Touchscreens have on-screen steering, throttle, brake, and boost buttons. Sound effects are off by default; turn them on using the button in the top-right corner.

Follow the arrow in the upper-left panel and the destination marker. **Slow down and park inside the glowing delivery ring** to hand over your parcel automatically. You must remain parked briefly: speeding through or flying over the ring will not count. Finish all three deliveries to see your journey time. There is no time limit or failure countdown.

The pale roads connect the sights, but you can drive freely over both land and water. This is arcade-style spherical driving, not a realistic vehicle or orbital simulation. Tree trunks, houses, and major buildings block your path. Pressing R stops and recovers the van in place; it does not teleport you back to the start.

## Build and test

```sh
npm run build
npm test
npm run test:browser
npm run preview
```

- `build`: Checks TypeScript and generates the static site in `dist/`.
- `test`: Runs Vitest unit tests for spherical math, driving, and delivery rules.
- `test:browser`: Uses Playwright with a locally installed Microsoft Edge to check desktop and narrow-screen layouts, driving, pause/resume, deliveries, replay, touch controls, graphics recovery messages, and unavailable storage. If Edge is not installed, update `playwright.config.ts` and install the browser you want to test with.
- Browser screenshots are saved to `artifacts/`. Failure diagnostics are saved to `test-results/`.

To deploy, serve `dist/` with a static hosting provider. No application backend, database, or user accounts are required. Do not launch the source by double-clicking `index.html` with a `file://` URL: use the local server for development and a hosted website URL for sharing.

## Technology and scope

- **Vite + TypeScript + Three.js**, with a native HTML/CSS interface.
- Procedurally generated planet, roads, van, houses, vegetation, windmill, observatory, clouds, and starfield. No external models, fonts, textures, or CDN requests.
- Static scenery is batched by material; rocks use instancing. Driving uses a fixed simulation timestep, simple collision bounds, a smooth chase camera, and reusable trail particles.
- Sound effects are synthesized with Web Audio. Your best time is saved in the current browser's `localStorage`; the game still works when storage is disabled.
- Requires a modern browser with WebGL 2. A recovery message is shown if the graphics context is unavailable or lost.
- This first version does not include multiplayer, realistic orbital physics, dynamic terrain, a large open world, or online leaderboards.

### Browser test helpers

Only in **Vite development mode**, and only when the URL includes `?test=1`, the game exposes `window.__planetTest`. It can read a runtime snapshot and park the van at the current destination. Browser tests use this interface to check the delivery flow deterministically rather than depending on an arbitrary driving route. The interface is removed from production builds.
