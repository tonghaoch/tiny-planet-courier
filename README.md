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
  <img src="docs/screenshots/planet-overview.jpg" alt="Three-stop Tour welcome screen with the release title Three stops. One big day, a Start delivering button, and the connected mint-green planet with its Bay road and ramp." width="1120" />
  <p><sub>Three stops. One big day. Welcome to one connected little world.</sub></p>
</div>

### The scenic route is the whole point.

Hop into your little van for the **Three-stop Tour**, the official default game. Bring a bit of joy to **Sunrise Bakery → Stargaze Station → Windmill Garden**, driving between neighbors on one connected planet. Choose the scenic road or a trickier shortcut. There is no countdown to beat—just three parcels and a planet worth exploring.

- **One planet, three route rhythms.** Coast around the Bay or boost off its ramp, brake through Station's tighter bends, and link the Garden's flowing turns.
- **Small deliveries, zero rush.** Park in the glow, watch each neighbor react, and drive straight on to the next stop—no scene swaps or interrupting results screens.
- **Find your own way.** A light-glass destination compass points toward your next neighbor; left-side hints help explain road choices. The compass is not a safe-road navigator.
- **Keep the journey going.** Recovery preserves your parcels and progress at earned safe points. Finish for a total time, three leg splits and a browser-local Tour best, then explore the closing road or restart.
- **One link, no installation for players.** Runs in a WebGL 2 browser with keyboard or touch controls. No account or backend required.

<p align="center">
  <img src="docs/screenshots/delivery-run.jpg" alt="Real Three-stop Tour driving near the Bay ramp: a parcel-loaded van on the road, a centered light-glass Sunrise Bakery compass, and road-choice hints on the left." width="880" />
  <br />
  <sub>Bakery first. Take the coast road—or hold boost off the ramp.</sub>
</p>

> **Ready for a little escape?** [Play now](https://tonghaoch.github.io/tiny-planet-courier/), or [run it locally](#run-locally) to explore the code and make it your own.

---

## Run locally

Requires Node.js 20.19+ or 22.12+; **Node.js 24 is recommended**. Use `main` for the official game:

```sh
git clone --branch main https://github.com/tonghaoch/tiny-planet-courier.git
cd tiny-planet-courier
git log -1 --oneline
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** (or the URL printed in the terminal) to start the Tour. The development server only listens on your computer by default. The game has touch controls and a mobile layout, but accessing your computer's development server from a phone requires configuring access over a trusted local network.

For an existing clone, preserve local work first, then `git fetch origin`, `git switch main`, and `git pull --ff-only origin main`. Run `git log -1 --oneline` to identify the revision received. If switching or fast-forwarding is blocked, resolve it deliberately rather than discarding work. Full [cross-computer instructions and release evidence](docs/iteration-plan.md#current-checkpoint-and-cross-computer-handoff--2026-09-08) are in the handoff; the prototype branch is historical development context.

### Development-only comparisons and tools

The normal development root and production root both enter Tour. In **Vite development mode only**, these explicit selectors remain available:

| Local URL | Experience |
| --- | --- |
| [/?prototype=bay](http://127.0.0.1:5173/?prototype=bay) | One-parcel Bay Leap: coast road or ramp shortcut |
| [/?prototype=station](http://127.0.0.1:5173/?prototype=station) | One letter for Station: wide outer road or tighter inner lane |
| [/?prototype=garden](http://127.0.0.1:5173/?prototype=garden) | Flower seeds for Garden: wide loop or flowing Flower path |
| [/?prototype=standard](http://127.0.0.1:5173/?prototype=standard) | Original three-delivery game for comparison |
| [/?prototype=tour](http://127.0.0.1:5173/?prototype=tour) | Explicit Tour selection, equivalent to the root |

Missing, empty or unknown development selectors fall back to Tour. Standalone experiments retain playtest branding and independent best-time records. Production ignores **all** prototype query overrides and always runs Tour, with no test bridge—even with `?test=1`.

<a id="compact-hud-and-small-screen-welcome--locally-verified-owner-approval-pending"></a>

The [iteration history](docs/iteration-plan.md), [Tour plan](docs/tour-plan.md) and [destination-compass contract](docs/navigation-stability-plan.md) preserve earlier development checkpoints and verification. The owner's HUD acceptance and complete Tour playtest are finished, with no blocking issues; the official-main release and automatic Pages deployment are explicitly authorized. Publication for the exact release revision is verified separately by the primary, not inferred from these documentation updates.

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

Use the **destination compass in the top-center HUD** and the world marker to locate your next delivery. The compass points at the destination, not along a safe road; choose your route around obstacles and Bay water. The ramp launches the van—boost alone does not make it hop on flat ground. **Slow down and park inside the glowing delivery ring** to hand over your parcel automatically. Remain parked briefly: speeding through or flying over the ring will not count.

Each handoff removes a parcel and immediately points the compass at the next neighbor. Road hints describe the transfer; if the road exit is behind you, reverse and turn gently. **R** or splash recovery returns you to your latest earned safe point, preserving deliveries, remaining parcels, splits and active journey time. Recovery cannot skip an unvisited transfer.

Finish all three deliveries to see your total and leg splits; transfers count toward the next leg and pauses do not. The closing road returns to Bay for unscored exploring. **Restart tour** resets all parcels, reactions, checkpoints and the journey clock. There is no time limit or failure countdown.

## Build and test

```sh
npm run build
npm test
npm run test:browser
npm run test:preview
npm run preview
```

- `build`: Checks TypeScript and generates the static site in `dist/`.
- `test`: Runs Vitest unit tests for spherical math, driving, delivery rules and entry selection.
- `test:browser`: Uses Playwright to check the original comparison, independent slices and connected Tour, including physically driven routes, desktop/narrow layouts, deliveries, replay, touch controls, graphics recovery and unavailable storage. Defaults to locally installed Microsoft Edge; with Chrome installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.
- `test:preview`: Builds and checks the production Tour default, query-override isolation, absence of the test bridge, real keyboard lifecycle and narrow pointer input. Use `PLAYWRIGHT_CHANNEL=chrome npm run test:preview` to select Chrome instead of Edge.
- Browser screenshots are saved to ignored `artifacts/`; failure diagnostics go to `test-results/`. The two selected README JPEGs are maintained documentation assets, not generated test outputs.

Run development-browser and production-preview checks **sequentially**. See the [handoff](docs/iteration-plan.md#official-tour-release-verification--2026-09-09) for primary-observed release results and fresh-process split commands; these are not a claim of one all-in-one browser run.

The production build uses the `/tiny-planet-courier/` base path. After building, `npm run preview` serves Tour at **http://127.0.0.1:4173/tiny-planet-courier/** by default; `npm run dev` uses the root URL. Update `vite.config.ts` if you deploy under a different path or a custom domain. Do not launch the source by double-clicking `index.html` with a `file://` URL.

## Automatic deployment

**Online play:** https://tonghaoch.github.io/tiny-planet-courier/

Every push to `main` runs the existing [Deploy to GitHub Pages workflow](.github/workflows/deploy.yml):

1. Set up Node.js 24 and install locked dependencies with `npm ci`.
2. Run unit tests with `npm test`.
3. Build the game with `npm run build`.
4. Upload `dist/` with the official Pages artifact action.
5. Deploy to GitHub Pages using the `github-pages` environment.

Deployment proceeds only when tests and build succeed. The workflow uses GitHub's built-in token; no personal access token or additional repository secret is required. Build artifacts remain out of Git history. The primary's release report verifies the workflow and actual public game against the exact pushed SHA; push success alone is not deployment confirmation.

To redeploy manually, open **Actions → Deploy to GitHub Pages → Run workflow** and select `main`. The repository's **Settings → Pages → Source** must be **GitHub Actions**. Production deployments are restricted to `main`. Browser tests remain separate local checks because they require an installed browser; the deployment workflow runs unit tests and the production build on Ubuntu.

## Technology and scope

- **Vite + TypeScript + Three.js**, with a native HTML/CSS interface.
- Procedurally generated planet, roads, van, houses, vegetation, windmill, observatory, clouds, and starfield. No external models, fonts, textures, or CDN requests.
- Static scenery is batched by material; rocks use instancing. Driving uses a fixed simulation timestep, simple collision bounds, a smooth chase camera, and reusable trail particles.
- Sound effects are synthesized with Web Audio. Best times are saved in the current browser's `localStorage`; the game still works when storage is disabled. Tour and comparison modes keep separate records.
- Requires a modern browser with WebGL 2. A recovery message is shown if the graphics context is unavailable or lost.
- No multiplayer, realistic orbital physics, dynamic terrain, a large open world, or online leaderboards.

### Browser test helpers

Only in **Vite development mode**, when the URL contains a `test` parameter (for example `?test=1`), the game exposes `window.__planetTest`. Snapshots observe driving, cargo and recipient reactions; `setControls` supplies real controller inputs. Complete route fixtures support physically driven Tour continuity tests. `dockAtTarget`, `dockAtStop(index)` and `setNavigationFixture` isolate UI/state checks through pose fixtures; they are **not proof of route playability**. The bridge is absent from production regardless of query parameters.

The README images are actual production-preview captures with normal Start/keyboard input, not test fixtures or generated artwork. See [capture provenance](docs/iteration-plan.md#release-screenshot-provenance--2026-09-09) for settings and limits. Contributors and agents should follow [AGENTS.md](AGENTS.md), discovered through `CLAUDE.md`.
