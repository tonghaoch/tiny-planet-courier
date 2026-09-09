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

> **Continuing on another computer?** Use **`prototype/three-stop-tour`**, not the older Bay checkpoint. This owner-approved checkpoint packages the verified left-hint/left-toast/light-frost HUD over **previous published baseline `aa853e6`, `Compact navigation HUD and fix mobile welcome layout`**. On 2026-09-09, the owner separately praised this CURRENT version ("very good, great, this version is very good") and explicitly requested **commit + push, then the next step**. This is distinct from the earlier `aa853e6` approval. Use `git log -1 --oneline` after the existing clone/switch/pull instructions to identify the actual received revision; the primary owns Git execution and remote-SHA verification, and no new push success or SHA is claimed here. See the **[current cross-computer handoff](docs/iteration-plan.md#current-checkpoint-and-cross-computer-handoff--2026-09-08)**. Authorization covers only this prototype-branch checkpoint/push, not promotion, main merge or deployment; production remains original-only.

Requires Node.js 20.19+ or 22.12+ (recommend Node.js 24; current macOS verification used v24.13.1 and npm 11.10.1).

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

The prototype has its own best-time record. Its entry is available only in Vite development mode; production builds and the current live game retain the original route. The historical accepted-slice checkpoint is on `prototype/bay-leap`; current work continues on `prototype/three-stop-tour`, without merging into `main` or deploying.

### Stargaze Station playtest — development only

Open **http://127.0.0.1:5173/?prototype=station** for the next independent one-parcel route: a **letter from Earth** for Stargaze Station. This does not replace Bay Leap or join the destinations into a longer tour.

- Follow the green arrows around the wide **outer road**, or take the coral-arrow **inner lane** and brake early for its tighter bends.
- Both roads use the same driving controller and tuning as Bay Leap. Rocks and planters define the approaches; there are no new buttons, jumps, grip rules or time limits.
- Park in the glow to hand over the letter. The recipient, warm lamps and turning telescope react without taking away driving control.
- **R** immediately returns to the approach with the current delivery clock intact. **Try another route** resets the letter, reaction and clock for another attempt at this same destination.
- Station has its own best-time record, separate from the original game and Bay Leap. Keyboard, optional sound and touch controls remain available after delivery.

### Windmill Garden playtest — development only

Open **http://127.0.0.1:5173/?prototype=garden** to bring a packet of **flower seeds** to the gardener. This third independent slice focuses on smooth, linked turns rather than Station's tighter braking challenge.

- Follow the green arrows around the wide **Garden loop**, or take the shorter coral-arrow **Flower path** through continuous S-bends between visible flower beds.
- The driving controller and tuning are unchanged. Look ahead and link your turns; no new buttons, grip rules, jumps or wind forces are needed.
- Park in the glow: the gardener takes the seeds, waves, and the nearby flowers bloom. The windmill remains decorative, and delivery does not interrupt driving.
- **R** returns to the approach without restarting the clock. **Try another route** resets the seeds, gardener, flowers and clock for another attempt.
- Garden has its own best-time record, independent of Bay Leap, Station and the original game. Optional sound, reduced-motion feedback and touch controls are supported.

### Three-stop Tour playtest — development only

Open **http://127.0.0.1:5173/?prototype=tour** for the connected **Sunrise Bakery → Stargaze Station → Windmill Garden** journey. The **2026-09-09** left-context/soft-glass follow-up is primary-verified and now separately owner-visually accepted, beyond the prior **`aa853e6`** approval; refresh the development server to try it. The owner explicitly requested this prototype-branch checkpoint/push. **Freeze the accepted HUD baseline; next, the owner should drive a complete Tour through the closing road, including at least a recovery/restart check**, to assess destination-compass usability, road handoffs, left-side hints during actual driving and whole-journey pacing. Visual praise and automated tests do not satisfy these gameplay gates. If accepted, production promotion/main merge/Pages can be proposed separately and still require explicit authorization; the public game remains original-only.

- All three accepted local courses share one planet, joined by visible roads. Choose the wide or shorter path at each stop; there are no scene swaps or automatic van resets between deliveries.
- Start with three small parcels on the rack. Each delivery removes one, starts that neighbor's reaction, and immediately retargets the compass to the next **delivery destination**, not the connecting road. Road hints still describe the transfer; if an exit is behind the van, reverse and turn gently.
- **R** returns to your latest earned safe point: initially the Bay entrance, then the delivered pad, then the next entrance only once you physically reach it while grounded. Recovery preserves deliveries, remaining parcels, splits, and active journey time; it cannot skip an unvisited transfer.
- After the third delivery, a compact total, three leg splits, and Tour best appear without stopping the van or taking focus. Splits include transfer driving and exclude pauses. The closing road returns to Bay for unscored exploring.
- **Restart tour** resets all three parcels, reactions, checkpoints and the journey clock. Tour records use their own key, separate from the original game and each independent slice. Sound remains off by default.

All prototype selectors are development-only. Production builds and `npm run preview` intentionally keep the original three-delivery game, including when prototype query parameters are present.

### Historical Tour integration verification

The coordinator's **earlier Tour integration** checks passed: **168 unit tests in 17 files**, TypeScript and production build, **4 focused Tour browser cases**, **20 full development browser cases**, and **6 production-preview cases**. Desktop handoff/end screenshots for all three locales and the 320px final UI were reviewed. An additional automated keyboard smoke check followed only visible HUD text/arrow, with no test bridge or route fixtures: all three deliveries completed, final HUD **03/03** at approximately **00:26**, with no browser errors. These are technical checks, not an owner/human playtest or a claim that the Tour is fun. Full commands and build diagnostics are in the handoff.

### Destination-compass follow-up — independently verified, owner playtest pending

The current navigation rule applies to the original game and every development prototype: **whenever the arrow is shown, it points to the active delivery destination**. It is not a road-following guide or an obstacle-avoidance route. Choose roads, ramps and detours yourself; the arrow may point across Bay water or toward an obstacle. Distance and the next-stop name refer to that same destination, and Tour handoffs immediately switch it to the next neighbor.

The centered glass HUD, frame-independent shortest-arc animation and reduced-motion behavior are retained. Near the delivery ring, **P** and brake/hold cues replace steering; recovery has its own cue, and navigation stays hidden on home, pause and completion. Road-choice and reverse-to-exit hints remain road-aware, independent of the compass.

**Historical destination-compass verification:** on Windows/Edge, all 85 distinct cases had passing observations across **42 + 1 + 42**, not one full pass. The 320px interruption was an initial page-load timeout, followed by fresh-browser passes; it was not a layout assertion. The [handoff](docs/iteration-plan.md#historical-destination-compass-verification--windows-checkpoint) preserves those results and bounded test repairs. The new macOS full-run result below supersedes that verification limitation, not the historical record or the separate Windows startup issue.

The primary also compared actual rendered DOM arrow angles against an independent destination-bearing formula in all five modes, both Tour transitions and mobile, with no browser errors, and reviewed desktop/mobile screenshots. Those fixtures isolate UI/target semantics, not route playability; real-controller route tests provide that evidence. Shortest-arc animation remains, and a coincident airborne destination has no invented heading. **Owner hands-on approval remains pending.** The owner authorized this branch checkpoint/push, not a production release.

<a id="compact-hud-and-small-screen-welcome--locally-verified-owner-approval-pending"></a>

### Historical compact HUD and small-screen welcome — verified and visually approved at `aa853e6`

These styling details and macOS checks describe the previous published checkpoint, not the newly accepted treatment. See the [current left-context/soft-glass handoff](docs/iteration-plan.md#current-left-context-and-soft-glass-iteration--2026-09-09) for the `.18` glass, left hint/toast, reduced-motion repair and latest primary-supplied verification.

The 2026-09-08 refinement changes only `src/style.css` and permanent expectations in `tests/browser/ui-readability.spec.ts`. Compact-portrait spacing reclaims **20px** without reducing welcome text or CTA sizes: the 320×640 Tour globe now measures **177.65625px**, above the unchanged 170px gate, with paragraph/CTA clearance and visibility preserved.

The centered HUD uses real responsive layout at **70% of its former width**, approximately 70% height—not component transform/zoom scaling. Initial Tour bounds are **420×102.390625** desktop, **207.1875×95.78125** at 320×640, and **364×65.59375** at 844×390. Long copy can wrap; destination/distance/hint/auxiliary type floors are **14/18/12/10px**, with **34/28/32px** desktop/portrait/short-landscape arrows. Gameplay, compass behavior, camera rules and all control hit targets are unchanged.

Normal glass is `rgba(2, 8, 10, .56)` (previously `rgba(16, 40, 47, .63)`), retaining 5px blur / 1.08 saturation and fully opaque warm-white text/coral arrows. Actual-style white-background contrast is **4.58575:1 text / 5.39172:1 arrow with its disc**; ≥4.5/≥3 gates remain. Fallback/reduced transparency keep the `.96` dark-teal backing without blur or geometry changes; the whole HUD is not faded.

**Primary-observed verification on 2026-09-08, not worker-run:** on macOS with Node v24.13.1, npm 11.10.1 and local Chrome, **192/192 unit tests (21 files)**, TypeScript/production build, **85/85 development browser cases in one command (6.7 minutes, no skips)**, then **6/6 production-preview cases sequentially**, all passed. A fresh 320×640 Tour welcome repeat passed **3/3**. The pre-change macOS full run had completed 84/85, with a real 157.65625px globe failure repeated 3/3—not the historical Windows timeout. Only intentional HUD size/type/normal-color expectations changed; no welcome/contrast relaxation or timeout increase. The primary also measured actual bounds, opacity, contrast, no component scaling and van clearance, and inspected desktop/phone/short-landscape screenshots. Only the existing nonblocking bundle-size warning remains. No permanent Windows startup fix or actual Safari/WebKit run is claimed.

See the **[current iteration handoff](docs/iteration-plan.md#current-checkpoint-and-cross-computer-handoff--2026-09-08)** for fresh/existing-clone commands, bounded navigation-test repairs, complete verification details and fresh-process browser reproduction commands. Browser bests/`localStorage`, ignored screenshots/test outputs and dependencies do not transfer; regenerate with `npm ci` and tests. No agent worktrees, models, credentials or backend are needed to run the game. See the [approved Tour plan](docs/tour-plan.md) for scope; contributors and agents should follow committed [AGENTS.md](AGENTS.md), discovered through `CLAUDE.md`.

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

Use the **destination compass in the top-center HUD** and the world marker to locate your next delivery. The compass points at the destination, not along a safe road; choose your route around obstacles and, in Bay playtests, water. **Slow down and park inside the glowing delivery ring** to hand over your parcel automatically. You must remain parked briefly: speeding through or flying over the ring will not count. Finish all three deliveries to see your journey time. There is no time limit or failure countdown.

In the original game, the pale roads connect the sights, but you can drive freely over both land and water. This is arcade-style spherical driving, not a realistic vehicle or orbital simulation. Tree trunks, houses, and major buildings block your path. Pressing R stops and recovers the van in place; it does not teleport you back to the start.

## Build and test

```sh
npm run build
npm test
npm run test:browser
npm run test:preview
npm run preview
```

- `build`: Checks TypeScript and generates the static site in `dist/`.
- `test`: Runs Vitest unit tests for spherical math, driving, and delivery rules.
- `test:browser`: Uses Playwright to check the original game, all three independent slices, and the connected Tour, including physically driven routes, desktop/narrow-screen layouts, pause/resume, deliveries, replay, touch controls, graphics recovery and unavailable storage. Defaults to locally installed Microsoft Edge; with Chrome installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.
- `test:preview`: Builds and checks that production still shows the original game and never exposes the local test bridge. Use `PLAYWRIGHT_CHANNEL=chrome npm run test:preview` to select Chrome instead of Edge.
- Browser screenshots are saved to `artifacts/`. Failure diagnostics are saved to `test-results/`.

Run development-browser and production-preview checks **sequentially**. If an earlier Windows host's long-lived Edge session stalls page loads, use separate fresh processes and check port ownership before handling server startup issues. See the [current handoff](docs/iteration-plan.md#current-left-context-and-soft-glass-iteration--2026-09-09) for the latest sequential Edge split commands; the [historical reproduction section](docs/iteration-plan.md#reproduce-checks-and-host-limitations) preserves the earlier full Chrome run and focused welcome repeat.

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

The browser tests remain separate local checks because they require an installed browser. The deployment workflow runs unit tests and the production build on Ubuntu.

## Technology and scope

- **Vite + TypeScript + Three.js**, with a native HTML/CSS interface.
- Procedurally generated planet, roads, van, houses, vegetation, windmill, observatory, clouds, and starfield. No external models, fonts, textures, or CDN requests.
- Static scenery is batched by material; rocks use instancing. Driving uses a fixed simulation timestep, simple collision bounds, a smooth chase camera, and reusable trail particles.
- Sound effects are synthesized with Web Audio. Your best time is saved in the current browser's `localStorage`; the game still works when storage is disabled.
- Requires a modern browser with WebGL 2. A recovery message is shown if the graphics context is unavailable or lost.
- This first version does not include multiplayer, realistic orbital physics, dynamic terrain, a large open world, or online leaderboards.

### Browser test helpers

Only in **Vite development mode**, and only when the URL includes `test=1`, the game exposes `window.__planetTest`. Snapshots observe driving, cargo and recipient reactions; `setControls` supplies real inputs. Tour fixtures include every complete wide/short leg and the closing connector, while snapshots also expose session-owned splits, earned checkpoints and per-stop reactions. The Tour browser continuity tests drive these routes without changing vehicle poses. `dockAtTarget`, Tour-only `dockAtStop(index)` and `setNavigationFixture` are explicit pose fixtures for isolated UI/state checks, **not proof of route playability**. Snapshot `navigationTarget` and `guidance.target` are the active delivery destination; `canonicalHeading`, `directDestinationHeading` and the steering HUD command agree at the captured pose. The displayed angle may lag only for shortest-arc animation. Branch, phase and compact cursor fields describe road context, not compass targets; snapshot reads are passive and diagnostic arrays/cursors are isolated. The bridge is removed from production builds, including `?prototype=tour&test=1`.
