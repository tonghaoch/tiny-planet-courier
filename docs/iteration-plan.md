# Delivery prototypes — iteration plan and handoff

## Current checkpoint

- **Branch:** `prototype/bay-leap`
- **Status:** Bay Leap and Stargaze Station both received positive owner playtest feedback on 2026-09-07. Windmill Garden is the next proposed slice; implementation has not started.
- **Scope:** One parcel and two route choices per selected slice. The original three-stop game and the existing Bay Leap remain available.

This branch contains the Bay Leap and Station checkpoints for cross-computer continuation. After positively playtesting Station, the owner requested its checkpoint commit/push before starting Garden. **Neither checkpoint authorizes merging into `main` or replacing the live GitHub Pages game.**

## Continue on another computer

Use Node.js 24, then:

```sh
git clone --branch prototype/bay-leap https://github.com/tonghaoch/tiny-planet-courier.git
cd tiny-planet-courier
npm ci
npm run dev
```

- **Bay prototype:** http://127.0.0.1:5173/?prototype=bay
- **Station prototype:** http://127.0.0.1:5173/?prototype=station
- **Original game for comparison:** http://127.0.0.1:5173/
- **Existing public game:** https://tonghaoch.github.io/tiny-planet-courier/

If the repository is already cloned, start with a clean working tree, run `git fetch origin`, and check out `prototype/bay-leap`. If no local copy of that branch exists yet, use `git switch --track origin/prototype/bay-leap`.

The prototype selector is gated by `import.meta.env.DEV`. **`npm run preview` and production builds intentionally show the original game, even if `?prototype=bay` or `?prototype=station` is present.** Unknown prototype values also use the original game. Use the development server to play these slices.

The project is self-contained: no local agent worktrees, global configuration, external models, credentials, or backend service are required. Best times are browser-local and are not transferred by Git.

## The design goal

Do not grow a feature checklist. Make a short delivery worth replaying because the player can feel their control improving.

> Take the coastal road for a comfortable first delivery, or accelerate up a ramp and leap over the bay. See the planet curve beneath the van, make a small correction, and land on the far shore. Brake into the bakery's delivery ring. A door opens, the recipient takes the parcel, and the windows warm up—without taking control away from the player.

```text
             Coastal road: safe and readable
          +----------------------------------+
Spawn ----+               Bay                +---- Sunrise Bakery
          +-- Ramp >>> air >>> Landing area --+
                  Shortcut: faster, skillful
```

### Boundaries to preserve

- One parcel per selected slice: **Sunrise Bakery** in Bay Leap, **Stargaze Station** in Station. No larger mission system or connected three-stop prototype yet.
- Keep the English UI and mint, cream, and coral toy-world aesthetic.
- No time limit, parcel loss, long retry sequence, or blocking delivery cutscene.
- No new driving buttons: WASD/arrows, Space, R, and the existing touch controls.
- No multiplayer, currency, shop, progression tree, weather system, extra planets, or large physics engine in this iteration.
- Keep the existing game available for comparison; do not disturb its saved best time.

## Implemented in this checkpoint

- [x] Development-only prototype entry with a single delivery and data-driven progress UI.
- [x] Authored bay, coastal road, ramp, landing area, and bakery using shared level data.
- [x] Visible coastline and water classification use the same polygon; ramp geometry and support height use the same profile.
- [x] Smoothed steering, momentum, distinct braking, and gentler reverse acceleration.
- [x] Ramp-lip launch instead of arbitrary boost-triggered hops in the prototype.
- [x] Repeatable sphere-relative flight, limited air steering, a landing guide, and a van-aligned ground shadow.
- [x] Splash recovery to a dry approach with the parcel intact and boost replenished; R provides an immediate manual retry at that approach.
- [x] Landing compression, cargo movement, ground-only dust, and restrained camera changes.
- [x] Optional engine, wind, boost, landing, collision, and splash audio with reusable nodes and reliable mute/pause handling.
- [x] Bakery door, recipient, parcel handoff, and warm windows remain dynamic rather than being baked into static scenery.
- [x] Delivery stops the clock but leaves driving available; the compact result card does not steal focus or block touch controls.
- [x] Retry resets the parcel, bakery reaction, driving state, and delivery clock.
- [x] Separate bay best-time storage.
- [x] Navigation-arrow/steering sign correction and a behavioral regression test.
- [x] Keyboard boost remains usable after toggling sound; focused buttons retain normal keyboard activation.

### Important implementation choices

The controller uses **scalar ground momentum and smoothed yaw**, not a full lateral tire/slip simulation. Air movement is a deliberately consistent **sphere-relative ballistic arc**, not Newtonian orbital mechanics. Airborne throttle/boost does not extend the jump.

The safe checkpoint is an authored dry approach, not whichever shoreline point was most recently touched. Automatic splash recovery takes about half a second; a manual R recovery is immediate. Neither recovery resets the delivery timer. **Try another route** starts a genuinely new delivery and resets the whole slice.

Reverse acceleration was softened after a regression test exposed an interaction problem: holding the brake could start reversing too quickly to complete the parking dwell. Preserve the test when tuning braking or reversing.

## Station expansion — 2026-09-07

The owner described Bay Leap as more comfortable and realistic, and positively confirmed the leap/retry and delivery feedback. Preserve that handling baseline: `BAY_DRIVING_TUNING` and Bay's authored geometry were not retuned for Station.

- [x] Independent DEV-only Station entry, with one **letter from Earth** and a separate best-time key: `tiny-planet-courier:station:best:v1`.
- [x] A wide, sweeping **outer road** and a shorter **inner lane** with consecutive bends and braking marks. Green and coral arrows, a fork sign, visible rocks, and round planters distinguish the alternatives.
- [x] A shared local-level sampler/coordinate frame, while preserving Bay's existing exports, water polygon and ramp behavior. Each scene builds only its selected locale; the authored footprints are not overlaid into a tour.
- [x] Station is anchored at the original destination, latitude −10°, longitude 85°. Its pad is local `(0,0)`; spawn and recovery are `(-11,0)`.
- [x] Route-aware guidance follows the selected branch rather than Bay's coastline heuristic.
- [x] A Station recipient takes the letter, lamps warm, and the telescope turns. Dynamic objects survive static batching; lamp materials are isolated; pause, replay, and reduced motion are covered.
- [x] Nonblocking completion, stopped finished timer, continuing driving, input cleanup, and independent records reuse the existing session model.
- [x] R synchronizes the vehicle's public pose immediately, rather than exposing the previous frame's pose after the controller has already recovered. Bay and Station both have a regression test; handling parameters are unchanged.
- [x] Desktop home content and 320px touch/result layouts checked; existing result-card selectors remain compatible.

Road and grass deliberately use the same driving behavior. Visible obstacles discourage a straight-line bypass; no invisible lane walls or new grip rules were introduced. Both route choices share one Station record. R retains the current delivery clock; **Try another route** resets the selected slice, not the destination selection.

## Where to work

| Area | Files | Responsibility |
| --- | --- | --- |
| Shared local geometry | `src/authored-level.ts` | Geodesic coordinates, road outlines, footprint clearance, surface sampling and optional ramp support |
| Bay course | `src/bay-level.ts` | Unchanged `BAY_LEVEL` layout and existing Bay-facing exports |
| Station course | `src/station-level.ts` | Station roads, obstacles, spawn/recovery, landmark placement and branch guidance |
| Prototype identity and copy | `src/delivery-prototypes.ts` | DEV selector, English per-slice copy and isolated record keys |
| Driving feel | `src/bay-driving.ts` | `BAY_DRIVING_TUNING`, grounded/airborne/recovering states, flight prediction, contact and recovery |
| Shared interfaces | `src/bay-types.ts` | Surface samples, poses, ramp crossings, drive events, and landing predictions |
| World and handoffs | `src/world.ts`, `src/station-reaction.ts` | Shared spherical overlays/clearance/batching, Bakery and Station reactions, splash pool |
| Vehicle presentation | `src/vehicle.ts` | Shared van model, prototype controller adapter, suspension/cargo feedback, landing guide and shadow |
| Integration and camera | `src/main.ts` | DEV selector, fixed-step update, events, camera, non-blocking delivery and local test bridge |
| Session and UI | `src/game.ts`, `src/ui.ts`, `src/style.css` | Completion policy, separate records, feedback, progress and compact result card |
| Sound | `src/audio.ts` | Optional driving/impact audio, mute, pause and lifecycle cleanup |
| Route validation | `src/bay-route.test.ts`, `src/station-route.test.ts`, `tests/helpers/bay-pilot.ts`, `tests/browser/` | Real-controller route completion and browser interaction checks |
| Production isolation | `tests/production/prototype.spec.ts`, `playwright.preview.config.ts` | Original-only preview and absence of the test bridge |

Keep geometry and physics in agreement. If changing ramp length/rise, shore positions, or landing dimensions, update the shared level data and recheck actual flight ranges. Do not create a visual-only ramp or a hidden support surface across the water.

## Validation at handoff

Last verified on 2026-09-07 with Node.js 24 and locally installed Google Chrome:

- **114 unit tests passed** (11 files), including the original 84-test baseline.
- **13 development browser tests passed**, preserving the original 10 checks and adding three Station flows.
- **4 production-preview browser checks passed**: default, Bay, Station and unknown selectors all keep the original game and expose no test bridge.
- TypeScript checks and the production build passed.
- Both Bay routes and both Station routes were completed by steering the actual controller, not by teleporting to the destination. Station's driven routes had no collisions, jumps or recoveries.
- Bay launch entry speeds of **6.2, 6.8, and 7.8** still land across the bay; the unboosted splash/recovery regression remains green.
- Station coverage includes selected-branch guidance, destination-specific handoff, isolated records, keyboard boost after sound toggle, immediate R state, pause, early restart, home/start, reduced motion, unavailable storage, continuing driving after completion and 320px simultaneous touch/retry behavior.

Recorded browser runs took roughly **9 seconds on Bay's coast route and 4.2 seconds via the leap**, and **8 seconds on Station's outer road versus 5.6 seconds through the inner lane**. These are technical smoke-test observations, **not human playtest results or proof that the new route is fun**.

```sh
npm test
npm run build
npm run test:browser
npm run test:preview
# With locally installed Chrome instead of the default Edge:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
PLAYWRIGHT_CHANNEL=chrome npm run test:preview
```

Browser tests default to a locally installed **Microsoft Edge**. `PLAYWRIGHT_CHANNEL` explicitly selects another available Playwright Chromium channel without changing the default; this handoff used `chrome`. Playing the game itself only needs a modern WebGL 2 browser. Do not change gameplay merely to accommodate a missing browser installation. `test:preview` builds first and starts an isolated preview on port 4173; development checks use port 5173.

Generated screenshots and test diagnostics go into ignored `artifacts/` and `test-results/` directories. Vite reports a non-blocking bundle-size warning; do not turn this playtest into an unrelated bundling rewrite unless measured loading problems justify it.

## Next iteration: plan Windmill Garden

### 1. Preserve the accepted Station baseline

On 2026-09-07, after being asked about route distinction and whether the inner lane rewards better driving, the owner confirmed they had played Station and called it excellent ("特别棒"). The Station playtest gate is satisfied; do not repeat the general acceptance checklist or retune the accepted handling without a concrete reason.

This is positive hands-on feedback, not a claim that every device or edge case was manually checked. Preserve the automated regressions, and propose Garden's scope before implementing it. It is not approval to connect the slices, merge, or deploy.

### 2. Tune the weakest link, not the feature count

- If a bend feels arbitrary, inspect its geometry, sightline, route guidance and braking room before changing the accepted global steering settings.
- If delivery feels flat, improve timing, framing, sound or the Station reaction before adding rewards or progression.
- If retries drag, adjust recovery/reset presentation instead of adding menus or a retry currency.

Make a small change, replay both Station and Bay routes, and preserve the regression tests. More realistic physics or stronger camera shake is not automatically an improvement.

### 3. Expand only after each slice earns it

- [x] Obtain positive owner feedback on Bay's driving, leap/retry and delivery loop.
- [x] Carry that baseline into an independently playable Station slice.
- [x] Obtain hands-on feedback on Station before implementing Windmill Garden.
- [ ] Then consider Garden's flowing S-path versus forgiving perimeter route, without new driving systems.
- [ ] Decide explicitly whether to connect the slices into a tour; the current locales are independent.
- [ ] Decide explicitly how prototypes become the production game, and promote/remove the DEV-only gate deliberately.
- [ ] Merge/deploy to `main` only when the owner separately approves that release step.
