<div align="center">
  <h1>🪐 Tiny Planet Courier</h1>
  <p><strong>A tiny planet. Three deliveries. One lovely little escape.</strong></p>
  <p>Take the scenic route in a cozy, low-poly 3D browser game.</p>
  <p>
    <a href="https://tonghaoch.github.io/tiny-planet-courier/"><strong>Play in your browser</strong></a>
    &nbsp;·&nbsp;
    <a href="#run-locally">Run locally</a>
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

> **Ready for a little escape?** [Play now](https://tonghaoch.github.io/tiny-planet-courier/), or [run it locally](#run-locally) to explore the code and make it your own.

---

## Run locally

Requires Node.js 20.19+ or 22.12+ (verified with Node.js 24).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal, usually **http://127.0.0.1:5173**. The development server only listens on your computer by default. The game has touch controls and a mobile layout, but accessing your computer's development server from a phone requires configuring access over a trusted local network.

### Bay Leap playtest — development only

Open **http://127.0.0.1:5173/?prototype=bay** for the experimental one-parcel route. The regular local URL still runs the original three-delivery game, so you can compare the two.

- Take the pale **coast road** for a relaxed delivery, or carry **W + Space** into the ramp for a leap across the bay.
- Boost no longer makes the van hop on flat ground in this prototype. The ramp launches the van; small steering corrections in the air move the landing guide.
- Aim for the sandy landing area, then **brake with S** before parking at Sunrise Bakery.
- Bay water is not drivable. A splash returns you to a safe approach with your parcel intact; **R** also returns you there for a quick retry.
- The bakery reacts to your delivery in the world. A small result card appears without taking away driving control; **Try another route** resets the parcel, bakery, and clock.
- Sound is optional. When enabled, the engine, wind, boost, and landing sounds provide extra driving feedback.

The prototype has its own best-time record. Its entry is available only in Vite development mode; production builds and the current live game retain the original route. Development is checkpointed on `prototype/bay-leap`; it has not been merged into `main` or deployed.

See the [iteration plan and handoff](docs/iteration-plan.md) for a fresh-computer setup, completed work, verification results, and the next playtest decisions.

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

The production build uses the `/tiny-planet-courier/` base path. After building, `npm run preview` serves it at **http://127.0.0.1:4173/tiny-planet-courier/** by default; `npm run dev` still uses the root URL. Update `vite.config.ts` if you deploy under a different path or a custom domain. Do not launch the source by double-clicking `index.html` with a `file://` URL.

## Automatic deployment

**Live game:** https://tonghaoch.github.io/tiny-planet-courier/

Every push to `main` runs the official GitHub Pages workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. Set up Node.js 24 and install locked dependencies with `npm ci`.
2. Run the unit tests with `npm test`.
3. Build the game with `npm run build`.
4. Upload `dist/` with the official Pages artifact action.
5. Deploy the artifact to GitHub Pages using the `github-pages` environment.

Deployment only proceeds when tests and the build succeed. The workflow uses GitHub's built-in token; no personal access token or additional repository secret is required. Build artifacts remain out of Git history.

You can also open **Actions → Deploy to GitHub Pages → Run workflow** and select `main` to redeploy manually. The repository's **Settings → Pages → Source** must be **GitHub Actions**. Production deployments are restricted to `main`.

The browser tests remain a separate local check because they currently require an installed Microsoft Edge. The deployment workflow runs unit tests and the production build on Ubuntu.

## Technology and scope

- **Vite + TypeScript + Three.js**, with a native HTML/CSS interface.
- Procedurally generated planet, roads, van, houses, vegetation, windmill, observatory, clouds, and starfield. No external models, fonts, textures, or CDN requests.
- Static scenery is batched by material; rocks use instancing. Driving uses a fixed simulation timestep, simple collision bounds, a smooth chase camera, and reusable trail particles.
- Sound effects are synthesized with Web Audio. Your best time is saved in the current browser's `localStorage`; the game still works when storage is disabled.
- Requires a modern browser with WebGL 2. A recovery message is shown if the graphics context is unavailable or lost.
- This first version does not include multiplayer, realistic orbital physics, dynamic terrain, a large open world, or online leaderboards.

### Browser test helpers

Only in **Vite development mode**, and only when the URL includes `?test=1`, the game exposes `window.__planetTest`. It can read a runtime snapshot and park the van at the current destination. Browser tests use this interface to check the delivery flow deterministically rather than depending on an arbitrary driving route. The interface is removed from production builds.
