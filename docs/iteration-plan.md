# Delivery prototypes — iteration plan and handoff

## Current checkpoint

- **Branch:** `prototype/bay-leap`
- **Status:** Bay Leap and Stargaze Station received positive owner playtest feedback on 2026-09-07. Windmill Garden was verified and received positive owner feedback on its distinct route rhythms on 2026-09-08.
- **Scope:** One parcel and two route choices per selected slice. The original three-stop game and all three independent prototypes remain available.
- **Checkpoint:** All three accepted slices; Station baseline `a69cf60`, followed by the Garden expansion.

This branch checkpoints Bay Leap, Station and Garden for cross-computer continuation. The owner requested Station's commit/push before starting Garden, then explicitly requested the Garden commit/push after positively playtesting its route rhythms. **These checkpoints do not authorize merging into `main` or replacing the live GitHub Pages game.**

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
- **Garden prototype:** http://127.0.0.1:5173/?prototype=garden
- **Original game for comparison:** http://127.0.0.1:5173/
- **Existing public game:** https://tonghaoch.github.io/tiny-planet-courier/

If the repository is already cloned, start with a clean working tree, run `git fetch origin`, and check out `prototype/bay-leap`. If no local copy of that branch exists yet, use `git switch --track origin/prototype/bay-leap`.

The prototype selector is gated by `import.meta.env.DEV`. **`npm run preview` and production builds intentionally show the original game, even if `?prototype=bay`, `?prototype=station` or `?prototype=garden` is present.** Unknown prototype values also use the original game. Use the development server to play these slices.

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

- One parcel per selected slice: **Sunrise Bakery**, **Stargaze Station** or **Windmill Garden**. No larger mission system or connected three-stop prototype yet.
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

## Garden expansion — 2026-09-08

After the Station checkpoint was committed and pushed as requested, the owner authorized the next independent slice. Garden preserves the accepted driving controller and focuses on linking turns smoothly, rather than repeating Station's tight braking bends.

- [x] DEV-only `?prototype=garden`, one **packet of flower seeds**, and record key `tiny-planet-courier:garden:best:v1`.
- [x] A wide **Garden loop** and a shorter **Flower path** through continuous S-bends. Curved centerlines feed both road outlines and sampling; no new grip, wind, jump or steering rules were added.
- [x] Visible flower-bed colliders, green/coral arrows and a fork sign. Road-width clearance checks prompted a wider outer approach and a smaller bed rather than looser tests or changed driving physics.
- [x] A local frame anchored at the original garden, latitude 48°, longitude −50°; delivery pad `(0,0)`, spawn and recovery `(-13,0)`.
- [x] Shared two-route navigation in `src/road-level.ts`, retaining Station's route data and guidance thresholds. Only the selected locale is built.
- [x] The gardener takes the seeds and waves; a nearby bed blooms with fixed, reusable scene objects. Pausing freezes the handoff/flowers, and restart restores their initial state. The rotor remains ambient scenery, not a moving obstacle or wind mechanic.
- [x] Independent records, completed-but-drivable sessions, immediate R recovery, early restart, home/start, optional sound, reduced-motion feedback and 320px touch/results use the existing contracts.
- [x] Desktop home, mid-route, delivered and small-phone screenshots inspected. Real-controller and browser route checks pass without collisions, jumps or recoveries.

Garden remains a short, independently selected delivery. Do not retune Bay or Station to accommodate it, and do not connect all three locales into a tour without an explicit map/session design decision.

## Where to work

| Area | Files | Responsibility |
| --- | --- | --- |
| Shared local geometry | `src/authored-level.ts` | Geodesic coordinates, road outlines, footprint clearance, surface sampling and optional ramp support |
| Bay course | `src/bay-level.ts` | Unchanged `BAY_LEVEL` layout and existing Bay-facing exports |
| Station course | `src/station-level.ts` | Station roads, obstacles, spawn/recovery and landmark placement |
| Garden course | `src/garden-level.ts` | Flowing paths, flower beds, spawn/recovery and windmill placement |
| Ground-route guidance | `src/road-level.ts` | Shared two-branch selection and navigation, with Station behavior preserved |
| Prototype identity and copy | `src/delivery-prototypes.ts` | DEV selector, English per-slice copy and isolated record keys |
| Driving feel | `src/bay-driving.ts` | `BAY_DRIVING_TUNING`, grounded/airborne/recovering states, flight prediction, contact and recovery |
| Shared interfaces | `src/bay-types.ts` | Surface samples, poses, ramp crossings, drive events, and landing predictions |
| World and handoffs | `src/world.ts`, `src/station-reaction.ts`, `src/garden-reaction.ts` | Shared spherical overlays/clearance/batching, destination reactions and splash pool |
| Vehicle presentation | `src/vehicle.ts` | Shared van model, prototype controller adapter, suspension/cargo feedback, landing guide and shadow |
| Integration and camera | `src/main.ts` | DEV selector, fixed-step update, events, camera, non-blocking delivery and local test bridge |
| Session and UI | `src/game.ts`, `src/ui.ts`, `src/style.css` | Completion policy, separate records, feedback, progress and compact result card |
| Sound | `src/audio.ts` | Optional driving/impact audio, mute, pause and lifecycle cleanup |
| Route validation | `src/bay-route.test.ts`, `src/station-route.test.ts`, `src/garden-route.test.ts`, `tests/helpers/bay-pilot.ts`, `tests/browser/` | Real-controller route completion and browser interaction checks |
| Production isolation | `tests/production/prototype.spec.ts`, `playwright.preview.config.ts` | Original-only preview and absence of the test bridge |

Keep geometry and physics in agreement. If changing ramp length/rise, shore positions, or landing dimensions, update the shared level data and recheck actual flight ranges. Do not create a visual-only ramp or a hidden support surface across the water.

## Validation at handoff

Last verified on 2026-09-08 with Node.js 24 and locally installed Google Chrome:

- **131 unit tests passed** (13 files), preserving the Station checkpoint's 114-test baseline.
- **16 development browser tests passed**, preserving the original and Station checks and adding three Garden flows.
- **5 production-preview browser checks passed**: default, Bay, Station, Garden and unknown selectors all keep the original game and expose no test bridge.
- TypeScript checks and the production build passed.
- All six intended routes were completed by steering the actual controller, not by teleporting to the destination. Station and Garden's driven routes had no collisions, jumps or recoveries.
- Bay launch entry speeds of **6.2, 6.8, and 7.8** still land across the bay; the unboosted splash/recovery regression remains green.
- Ground-prototype coverage includes selected-branch guidance, destination-specific handoffs, isolated records, keyboard boost after sound toggle, immediate R state, pause, early restart, home/start, reduced motion, unavailable storage, continuing driving after completion and 320px simultaneous touch/retry behavior. Garden additionally checks continuous movement through its S-bends and blooming/reset behavior.

Recorded browser runs took roughly **9 seconds on Bay's coast route and 4.2 seconds via the leap**, **8.1 seconds on Station's outer road versus 5.6 seconds through the inner lane**, and **9.2 seconds on the Garden loop versus 6.9 seconds on the Flower path**. These are technical smoke-test observations, **not human playtest results or proof that the new route is fun**.

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

## Next decision: whether to connect the slices

### 1. Preserve the accepted baseline

On 2026-09-07, after being asked about route distinction and whether the inner lane rewards better driving, the owner confirmed they had played Station and called it excellent ("特别棒"). The Station playtest gate is satisfied; do not repeat its general acceptance checklist or retune the accepted handling without a concrete reason.

The owner then explicitly requested the Station commit/push and the Garden implementation. On 2026-09-08, after playing Garden, they confirmed that different routes have different rhythms ("不同的路线不同的节奏") and that the experience feels good. Garden's route-rhythm/distinction playtest gate is satisfied. This does not claim manual coverage of every device or edge case, and is not approval to connect the slices, merge, or deploy. The owner subsequently requested the Garden commit/push.

### 2. Preserve three distinct route identities

- **Bay Leap:** approach speed, a readable leap, landing and forgiving retry.
- **Stargaze Station:** braking and line choice through tighter bends.
- **Windmill Garden:** steady, linked steering through flowing S-bends.

The same accepted driving controller supports these different rhythms. Future work should preserve that contrast; revisit the general playtest checklist only when a concrete change warrants it. The owner requested a Garden checkpoint; designing a connected journey remains a separate next decision.

### 3. Tune the weakest link, not the feature count

- If a bend feels arbitrary, inspect geometry, sightlines, route guidance and road-width clearance before changing global steering settings.
- If delivery feels flat, improve the gardener/bloom timing and framing before adding rewards or progression.
- If retries drag, adjust recovery/reset presentation instead of adding menus or a retry currency.

Make a small change, replay all three prototypes, and preserve the regression tests. More realistic physics or stronger camera shake is not automatically an improvement.

### 4. Expand only after each slice earns it

- [x] Obtain positive owner feedback on Bay's driving, leap/retry and delivery loop.
- [x] Carry that baseline into an independently playable Station slice and obtain positive owner feedback.
- [x] Commit and push the accepted Station checkpoint before starting Garden.
- [x] Implement Garden's flowing S-path versus forgiving perimeter route without new driving systems.
- [x] Obtain hands-on feedback on Garden before expanding again.
- [x] Obtain the owner's explicit request to commit/push the accepted Garden checkpoint.
- [ ] Decide explicitly whether to connect the slices into a tour; the current locales are independent.
- [ ] Decide explicitly how prototypes become the production game, and promote/remove the DEV-only gate deliberately.
- [ ] Merge/deploy to `main` only when the owner separately approves that release step.
