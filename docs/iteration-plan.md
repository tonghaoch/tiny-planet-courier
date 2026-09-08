# Delivery prototypes — iteration plan and handoff

<a id="current-checkpoint-and-cross-computer-handoff--2026-09-08"></a>

## Current checkpoint and cross-computer handoff — 2026-09-09

**Owner-approved visual checkpoint:** on 2026-09-09, the owner responded positively ("Very good") to the small-screen welcome repair and compact, more-transparent HUD, and explicitly requested updated handoff documentation plus commit/push on **`prototype/three-stop-tour`** at origin `https://github.com/tonghaoch/tiny-planet-courier.git`. This checkpoint adds the verified `src/style.css` refinement, `tests/browser/ui-readability.spec.ts` updates and these handoff documents to the connected Tour/destination-compass baseline. Use this branch, **not the older `prototype/bay-leap` checkpoint**.

**Previous published baseline: `56c92fc`**, not the new checkpoint's revision. Before checkpoint preparation, the primary fetched origin and confirmed `HEAD...origin/prototype/three-stop-tour` was **0/0**. The primary will review, commit, push and verify publication separately; this documentation does not claim the pending push succeeded. After publication, use the clone/update workflow below and `git log -1 --oneline` to identify the received revision rather than assuming a future hash.

The application/test diff remains byte-identical to the independently verified 2026-09-08 patch; no new test run is claimed for this documentation update. **Visual approval does not establish final destination-compass or complete Tour gameplay acceptance; those gates remain pending.** No prototype production promotion, main merge or Pages deployment is authorized. The previous main/Pages baseline remains `8656d31`; production remains original-only.

### Continue on another computer

Recommend **Node.js 24**. Fresh clone:

```sh
git clone --branch prototype/three-stop-tour https://github.com/tonghaoch/tiny-planet-courier.git
cd tiny-planet-courier
git log -1 --oneline
npm ci
npm run dev
```

For an existing clone, **first preserve any local work**. Do not automatically discard or stash it. Then:

```sh
git fetch origin
git switch prototype/three-stop-tour
# If the local branch is missing, use this instead of the switch above:
# git switch --track origin/prototype/three-stop-tour
git pull --ff-only origin prototype/three-stop-tour
git log -1 --oneline
npm ci
npm run dev
```

If switching or fast-forwarding is blocked by local work/divergence, stop and resolve it deliberately; do not use `reset --hard`.

- **Main playtest:** http://127.0.0.1:5173/?prototype=tour
- **Original comparison:** http://127.0.0.1:5173/; Bay, Station and Garden remain independently selectable with `?prototype=bay`, `?prototype=station` and `?prototype=garden`.
- **Use `npm run dev`, not `npm run preview`, for Tour.** Production/preview deliberately ignore prototype selectors and show the original game without the test bridge.
- Browser bests/`localStorage` do not transfer. Ignored screenshots, test outputs and dependencies do not transfer either; regenerate dependencies with `npm ci` and artifacts with tests. Local review images under `artifacts/destination-navigation-review/` are not shipped assets or dependencies.
- The game needs no local agent worktrees, models, credentials or backend. Agent collaboration policy is the committed `AGENTS.md`, discovered through the `CLAUDE.md` pointer.

### Current destination-compass contract

- In original/Bay/Station/Garden/Tour, steering points at active `run.target.normal` using vehicle-relative spherical `headingTo(vehicle.normal, vehicle.forward, run.target.normal)`. Destination name, distance and snapshot targets describe that same delivery. The arrow may point across water or obstacles by design; players choose their own safe route.
- Road caches feed hints/context and road-aware `reverseToExit`, not the compass. A destination behind the van does not imply that the road exit is behind it. Tour handoffs immediately retarget the next destination.
- Shortest-arc frame-independent smoothing, reduced motion, glass HUD, parking/recovery cues and hidden home/pause/completed navigation remain intact. A coincident airborne destination has no invented heading. R, splash recovery, restart, home and handoffs clear stale navigation state.
- Tour continuity, three parcels, splits, earned checkpoints and accepted route geometry/physics are unchanged. Pose fixtures isolate UI/target behavior, not route playability; real-input route tests provide the latter evidence. See [navigation-stability-plan.md](navigation-stability-plan.md).

### Current compact-HUD and welcome refinement — 2026-09-08

Application changes are confined to **`src/style.css`**; permanent test changes are confined to **`tests/browser/ui-readability.spec.ts`**. Main/UI TypeScript, the active-destination compass, driving, route geometry, game sessions, records, camera rules and control hit targets are unchanged.

- Compact-portrait welcome spacing reclaims **20px**, without reducing text or CTA sizes. The primary measured the **320×640 Tour globe at 177.65625px**, up from 157.65625px, retaining paragraph/CTA clearances and CTA visibility. Welcome body text remains 18px desktop / 16px mobile, support copy 12px, and CTA 17px / 54px tall.
- HUD sizing uses **real responsive layout, not whole-component transform/zoom scaling**. Long copy can wrap. Text floors are destination **14px**, distance **18px**, hint **12px**, auxiliary navigation **10px**; arrows are **34px desktop / 28px portrait / 32px short landscape**. Welcome/control typography and hit areas are unchanged.

| Initial Tour viewport | Before HUD width × height | After HUD width × height | Width / height retained |
| --- | --- | --- | --- |
| 1440×900 | 600 × 146.296875 | 420 × 102.390625 | 70% / 69.99% |
| 320×640 | 296 × 134.890625 | 207.1875 × 95.78125 | 70% / 71.01% |
| 844×390 | 520 × 94.1875 | 364 × 65.59375 | 70% / 69.64% |

Normal glass is now **`rgba(2, 8, 10, .56)`**, replacing `rgba(16, 40, 47, .63)`, with the same `blur(5px) saturate(1.08)`. Warm-white text and coral arrows remain fully opaque; there is no opacity on the HUD or its ancestors. Independent composition of actual styles measured minimum white-background contrast **4.58575:1 for text** and **5.39172:1 for the arrow with its unchanged local disc**. Assertions retain text ≥4.5 and arrow ≥3 over white and black, without credit for shadows. Unsupported-filter fallback and reduced transparency retain `rgba(16, 40, 47, .96)`, no blur, and unchanged geometry when preferences toggle.

### Current verification — primary-supplied results

The primary independently reviewed the actual checkout and ran these checks on **2026-09-08, macOS, Node v24.13.1, npm 11.10.1, local Chrome via `PLAYWRIGHT_CHANNEL=chrome`**. Neither implementation nor documentation-only worker ran tests for this refinement.

**All 85/85 development cases passed in one command (6.7 minutes), with no skips.** This supersedes the previous working-tree single-run verification limitation, without rewriting the historical Windows observations below.

| Check | Observed result |
| --- | --- |
| Before refinement | Unit **192/192** and build passed. One full development run completed **84/85**, failing the 320×640 Tour welcome globe at **157.65625px vs ≥170px**; that exact assertion repeated **3/3**. This was a real layout failure, not the earlier Windows startup/page-load timeout. |
| `npm test` | **192/192 passed in 21 files.** |
| `npm run build` | TypeScript/production passed; existing nonblocking >500kB warning only (**JS 683.21kB, gzip 181.42kB**). |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:browser -- --output=artifacts/compact-hud-review/browser` | **85/85 passed in one command**, including navigation, real-input complete Tours/closing road, glass/fallback/reduced transparency, text/viewports and visibility. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:preview -- --output=artifacts/compact-hud-review/production` | **6/6 passed**, run sequentially after development checks. Production remains original-only. |
| Fresh, correctly filtered 320×640 Tour welcome repeat | **3/3 passed.** An earlier over-anchored filter matched no tests; it executed no application assertions and was corrected before this repeat. |

The primary separately measured actual bounds, contrast, foreground opacity, absence of component scaling and van clearance, and inspected desktop, 320px phone and 844px short-landscape screenshots. Only intentionally changed HUD dimension/type/normal-color expectations were updated, with actual-bounds guards added. No welcome or contrast gates were relaxed and no timeouts increased. No permanent fix for the separate Windows startup issue or actual Safari/WebKit execution is claimed; fallback coverage exercises the stylesheet support gate.

**Implementation provenance:** the per-process CLI explicitly set `--model gpt-6-astra[1m] --effort medium`; provider message metadata identified `gpt-6-astra`. No global defaults changed and no fallback model was used. The primary independently verified instead of relying on worker claims.

### Historical destination-compass verification — Windows checkpoint

These earlier checks were run by the primary, **not the documentation-only worker**, with **Node v24.18.0, npm 11.16.0 and local Microsoft Edge on Windows**.

**All 85 distinct development cases had passing observations across sequential runs (42 + 1 + 42), NOT a clean 85/85 all-in-one command.** This remains the historical record, not the current macOS verification limit.

| Check | Observed result |
| --- | --- |
| `npm test` | **192 passed in 21 files.** |
| `npm run build` | TypeScript and production build passed; only the existing >500kB bundle warning (JS about 683kB, gzip 181kB). |
| Initial focused navigation | **20/23 passed, 3 failed.** Bounded repair retained strict browser-target equality, used 12-decimal tolerance for independently generated Node coordinates (a `Math.sin` difference around 1e-16), and waited for normal captured guidance after R. No gameplay or timeout relaxation; all 3 affected cases passed the focused rerun. |
| Full development command | Attempted all **85** cases. First **42 passed**, including all **23 current navigation cases**, original/standalone route tests and desktop wide/short real-input Tours plus closing road. Case 43, the existing 320px Tour case, timed out at **45s in initial `page.goto`**, before gameplay/layout assertions; trace confirmed this. The primary stopped the long-running command. |
| Identical 320px Tour, fresh browser | **3/3 passed** in 14.6/13.3/17.7s, without code changes or timeout increases. |
| Separate UI-readability suite | **42/42 passed**, including normal/fallback/reduced glass, all modes/viewports, touch/focus/scroll and real Bay launches. An initial attempt started no tests because Playwright's webServer hit its 30s startup timeout. The primary checked port ownership, started its own Vite server (ready about 1.4s), then ran the passing suite; no assertions or timeouts changed. |
| `npm run test:preview`, after UI checks | **6/6 production-isolation cases passed**, including Tour/unknown selectors, original game and no bridge. |

The primary independently compared the **actual rendered DOM arrow angle** with an independent destination-bearing formula in all five modes, both Tour target transitions and mobile, with no browser errors, and reviewed desktop/mobile screenshots. These UI/target-isolation fixtures do not prove route playability; use the real-input results above for that claim.

### Reproduce checks and host limitations

Run browser suites and production-preview checks **sequentially**, never concurrently. Edge is the default; the current macOS verification explicitly selected installed Chrome:

```sh
npm test
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:browser -- --output=artifacts/compact-hud-review/browser
PLAYWRIGHT_CHANNEL=chrome npm run test:preview -- --output=artifacts/compact-hud-review/production
# Focused welcome regression repeat in fresh test contexts:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser -- tests/browser/ui-readability.spec.ts --grep 'readable welcome and centered HUD in tour at 320x640' --repeat-each=3
```

The current full development command passed **85/85**. On the earlier Windows host, separate fresh-process files/suites helped isolate long-lived Edge page-load stalls; the historical checkpoint did not establish a permanent environment fix. If webServer startup stalls, check port ownership before starting your own `npm run dev` or stopping a process; never kill an unrelated server.

**Next gates:** the primary reviews and performs the requested branch commit/push, independently verifying the resulting checkpoint. Owner visual approval is recorded above; hands-on destination-compass and complete connected-journey acceptance remain separate pending gates. Preserve accepted driving and route rhythms. Prototype production promotion, main merge and deployment remain unauthorized release steps.

## Historical development handoff — Three-stop Tour

The records below describe earlier phases, including their then-current no-commit/no-push status and road-following verification. They do not override the current checkpoint authorization, destination-compass contract or verification above.

- **Working branch:** `prototype/three-stop-tour`, based on accepted slice baseline `412ef66`.
- **Entry:** http://127.0.0.1:5173/?prototype=tour (Vite development mode only).
- **Status:** Implementation is complete for local Tour playtesting, and the coordinator independently verified the integrated implementation after both workers finished. Owner feedback on the connected journey and explicit release authorization remain pending. No commits, pushes, merges or deployments have been made this iteration; public Pages remains untouched. The accepted independent slices and their records are preserved.
- **Approved scope:** One continuous Bakery → Station → Garden journey on one planet, using the accepted local routes/controller, three visible parcels, independent handoffs and a nonblocking final summary. The approved design is recorded in [tour-plan.md](tour-plan.md).
- **Runtime integration:** `TourSession` owns delivery order, active elapsed time, three transfer-inclusive splits and earned checkpoints. Main assigns World recovery from the session on start/home, handoff and grounded entrance changes; recovery does not restart the tour or unlock a future stop. Navigation originally used the active leg's `TourLayout.navigation` cache for steering; the current follow-up retains that cache only as road context and points the compass at the destination. Nothing resets van position, heading, speed or charge at a handoff.
- **Presentation:** Three small rack parcels are consumed one at a time at their actual world origins. Every indexed recipient reacts immediately; only the completed total saves `tiny-planet-courier:tour:best:v1`. Final total/splits/best and **Restart tour** leave driving active. Pause/blur freeze the journey and reactions; restart/home clear journey, cargo and reactions.
- **Test additions:** Independent cargo/registry unit coverage; DEV Tour snapshots and complete route fixtures; real-input wide/short full-tour and closing-road browser cases; earned recovery, wrong-stop/exactly-once, pause/blur, early restart, records and 320px reduced-motion/touch/focus fixtures; production Tour-query rejection.
- **Collaboration:** Follow [AGENTS.md](../AGENTS.md), the canonical policy, and the [approved Tour plan](tour-plan.md). The primary authored `AGENTS.md` and its `CLAUDE.md` discovery pointer at the owner's request. All application/test implementation came from GPT-6 subagents configured with medium effort; the coordinator independently reviewed and verified integration.
- **Earlier phase-C worker validation:** `npx vitest run src/vehicle-cargo.test.ts src/delivery-prototypes.test.ts` passed **25 tests in 2 files** before integrated verification. These tests did not import the concurrently edited World implementation.

### Integrated verification — coordinator results

The following results were supplied by the primary coordinator after both workers completed, **not run by the documentation-only finish worker**:

| Command | Coordinator result |
| --- | --- |
| `npm test` | **168 unit tests passed in 17 files.** |
| `npm run build` | TypeScript and production build passed. Only the existing non-blocking bundle-size warning remained; an earlier build also emitted a one-off plugin-timing diagnostic, not a failure. |
| `npm run test:browser -- tests/browser/tour.spec.ts --output=artifacts/tour-review/browser` | **All 4 focused Tour cases passed.** |
| `npm run test:browser -- --output=artifacts/tour-review/full-browser` | **All 20 development browser cases passed**, covering the original game, all single slices, both complete real-input Tours and their closing road, checkpoints, pause/early restart, and 320px touch/focus/recipient visibility. |
| `npm run test:preview -- --output=artifacts/tour-review/production` | **All 6 cases passed**, including Tour and unknown selectors remaining the original game with no test bridge. |

The coordinator also reviewed desktop handoff/end screenshots for all three locales and the 320px final UI. An additional independent automated smoke check on `/?prototype=tour` used **only visible HUD text/arrow and physical keyboard events**, with **no test bridge or route fixtures**. It completed all three deliveries with final HUD **03/03** at approximately **00:26** and no browser errors. This is automated keyboard verification, **not an owner/human playtest or a claim that the Tour is fun**.

Run development-browser and production-preview suites sequentially for future checks, as required by [AGENTS.md](../AGENTS.md). Owner playtesting should now assess whether the connected journey preserves each route's distinct rhythm and whether transfers, guidance and handoffs feel clear.

The Tour branch is local/unpublished at this handoff. The cross-computer commands and historical results below describe the **previous accepted slice checkpoint**, not a published Tour release. The earlier pending Tour design decision is superseded by the approved Tour plan; owner acceptance of the connected journey and production promotion remain separate gates.

### Historical UI-readability follow-up

The owner requested readable welcome copy and a navigation arrow outside the small side panel. GPT-6 subagents configured with **medium effort** implemented the follow-up; the primary independently reviewed and verified it. The results below were supplied by the primary, **not run by the documentation-only finish worker**. Prior Tour and accepted-slice results remain historical records.

- **Welcome:** Body text is **18px desktop / 16px mobile**; the CTA is **17px and 54px tall**, with useful **12px** support text. Start remains visible in standard portrait and **844×390** landscape. Extreme heights support real wheel/touch welcome scrolling, and the short-phone planet uses the available space instead of staying tiny.
- **Navigation:** An independent, opaque **top-center HUD** replaces side-panel navigation. The arrow is actually centered, with a **48px desktop / 40px portrait-mobile / 44px short-landscape SVG**. Next-stop text is **16–18px**, distance **24–28px**, and hints **14px**. Existing IDs and canonical navigation are reused, with shortest-angle presentation wrapping, reduced-motion support, stale-state hiding and avoidance of cached target labels.
- **Landscape repair:** The primary found that stacked toast/navigation panels obscured the van; a subagent using the same model/effort repaired it. At **844×390**, navigation spans **y68–162**, while the toast sits lower-left above touch controls, leaving the actual projected van visible. Gameplay/chase camera, routes, physics, timers and recovery semantics were unchanged; only welcome framing was adapted.

**Coordinator verification:**

- **172 unit tests** passed; TypeScript and the production build passed.
- **All 20 existing gameplay browser cases** passed in the full run. An initial new matrix case grouped five scenes under one **120-second** budget and timed out during the fifth `page.goto` after earlier loads consumed the budget; **no layout assertion failed**. The isolated original case passed **3/3**. A subagent split the matrix into independent fresh-context **mode × viewport** tests without dropping assertions or increasing the timeout.
- **All 39 resulting UI-readability browser cases** then passed. The coordinator verified **20 gameplay cases plus 39 UI cases across separate sequential commands**, not one 59-test full command.
- **All 6 production-preview isolation cases** passed afterward.
- The primary also completed a Tour using only **rendered arrow orientation, visible HUD text and physical keyboard events**, with **no bridge or route fixtures**, at roughly **00:39** and with no browser errors. This is automated verification, **not owner playtest approval**.

**Historical handoff:** Continue locally at http://127.0.0.1:5173/?prototype=tour on `prototype/three-stop-tour`. No new commits, pushes, merges or deployments; the public site remains untouched. Await the owner's impression of the new legibility; connected-journey acceptance and release authorization remain separate pending gates.

### Historical centered-HUD glass follow-up

The owner requested that the centered HUD feel less blocking. This CSS-only refinement supersedes the opaque backing described above: normal backing is `rgba(16, 40, 47, .70)` with `blur(5px) saturate(1.08)`, a lighter border/shadow, and full-opacity text/arrow with sufficient local contrast. Unsupported filtering and reduced-transparency preference use a `.96` backing alpha without blur. HUD location/sizing, navigation and gameplay are unchanged.

- **Coordinator verification, not run by this documentation-only worker:** **172 unit tests**, the build, **9 focused glass/layout/real-Bay-launch browser tests**, and **6 production-isolation tests** passed. The coordinator inspected real rendered desktop, mobile and short-landscape screenshots and measured the actual normal glass style; tested white-background text contrast was at least **4.69:1**.
- **Limits:** Fallback was tested by intercepting the stylesheet support gate, not on an actual old browser. No Safari/WebKit execution or full **42-case UI suite** rerun is claimed for this cosmetic follow-up.
- **Handoff:** Still local at http://127.0.0.1:5173/?prototype=tour on `prototype/three-stop-tour`, awaiting the owner's visual preference. No new commits, pushes, merges or deployments; the public site remains untouched, and connected-journey acceptance and release authorization remain pending.

- **Transparency follow-up:** At the owner's request for slightly more transparency, normal alpha is now `.63` instead of `.70`; opaque warm-white `#fffdf5` text retains **≥4.5:1** contrast against a white background. `blur(5px) saturate(1.08)` and the `.96` accessibility/fallback backing remain unchanged. The coordinator independently verified the build, **all 3 focused glass tests**, and actual runtime `rgba(16, 40, 47, 0.63)` / `opacity: 1`. This documentation-only worker ran no tests; no new full-suite run is claimed. Earlier verification remains historical; no commits, pushes or deployments.

## Previous accepted slice checkpoint

- **Branch:** `prototype/bay-leap`
- **Status:** Bay Leap and Stargaze Station received positive owner playtest feedback on 2026-09-07. Windmill Garden was verified and received positive owner feedback on its distinct route rhythms on 2026-09-08.
- **Scope:** One parcel and two route choices per selected slice. The original three-stop game and all three independent prototypes remain available.
- **Checkpoint:** All three accepted slices; Station baseline `a69cf60`, followed by the Garden expansion.

This branch checkpoints Bay Leap, Station and Garden for cross-computer continuation. The owner requested Station's commit/push before starting Garden, then explicitly requested the Garden commit/push after positively playtesting its route rhythms. **These checkpoints do not authorize merging into `main` or replacing the live GitHub Pages game.**

## Historical cross-computer setup — accepted slices only

For the current connected Tour checkpoint, use the setup at the top of this document. The following commands preserve the earlier slice-only handoff.

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

### Boundaries preserved from the accepted slice checkpoint

- One parcel per selected independent slice: **Sunrise Bakery**, **Stargaze Station** or **Windmill Garden**. The separately approved DEV Tour connects them without replacing these entries or adding a larger mission system.
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

Garden remains a short, independently selected delivery. Do not retune Bay or Station to accommodate it. The separate connected journey now follows the explicit map/session decision in [tour-plan.md](tour-plan.md); that approval does not replace the accepted independent slices.

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

## Historical validation — accepted slice checkpoint

The accepted slice handoff recorded verification on 2026-09-08 with Node.js 24 and locally installed Google Chrome. These historical counts are superseded by the integrated Tour coordinator results above:

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

## Next decision: owner feedback on the connected journey

### 1. Preserve the accepted baseline

On 2026-09-07, after being asked about route distinction and whether the inner lane rewards better driving, the owner confirmed they had played Station and called it excellent ("特别棒"). The Station playtest gate is satisfied; do not repeat its general acceptance checklist or retune the accepted handling without a concrete reason.

The owner then explicitly requested the Station commit/push and the Garden implementation. On 2026-09-08, after playing Garden, they confirmed that different routes have different rhythms ("不同的路线不同的节奏") and that the experience feels good. Garden's route-rhythm/distinction playtest gate is satisfied. This does not claim manual coverage of every device or edge case, and that slice feedback did not itself approve connecting the slices, merging, or deploying. The owner subsequently requested the Garden commit/push, then separately approved Tour development as recorded in [tour-plan.md](tour-plan.md). Connected-Tour owner feedback remains pending.

### 2. Preserve three distinct route identities

- **Bay Leap:** approach speed, a readable leap, landing and forgiving retry.
- **Stargaze Station:** braking and line choice through tighter bends.
- **Windmill Garden:** steady, linked steering through flowing S-bends.

The same accepted driving controller supports these different rhythms. Future work should preserve that contrast; revisit the general playtest checklist only when a concrete change warrants it. The owner requested a Garden checkpoint and subsequently approved connected-Tour development. The next playtest decision is whether that connected journey preserves the accepted contrast, not whether to implement it.

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
- [x] Approve the connected Tour map/session design separately from the accepted slices; see [tour-plan.md](tour-plan.md).
- [x] Complete DEV-only Tour implementation and independent coordinator verification for local playtesting.
- [ ] Obtain owner feedback on the connected journey; automated checks do not satisfy this gate.
- [ ] Decide explicitly how prototypes become the production game, and promote/remove the DEV-only gate deliberately.
- [ ] Merge/deploy to `main` only when the owner separately approves that release step.
