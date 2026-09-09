# Three-stop tour — approved development plan

## Scope and release boundary

Baseline: `412ef66`, with accepted Bay, Station, and Garden slices. Work on `prototype/three-stop-tour`.

The owner approved a physically continuous **Sunrise Bakery → Stargaze Station → Windmill Garden** development journey on one planet. The later compact-HUD/welcome checkpoint **`aa853e6`, `Compact navigation HUD and fix mobile welcome layout`**, received owner visual approval on **2026-09-09** and is the previous published baseline, following `56c92fc`; its requested push is not pending. Separately, on the same local date the owner enthusiastically approved the CURRENT left-hint/left-toast/light-frost version ("very good, great, this version is very good") and explicitly requested **commit + push, then the next step**. This owner-approved checkpoint packages that verified implementation; authorization covers only the prototype-branch checkpoint/push, not main merge, Pages deployment or prototype production promotion.

Add the DEV-only entry `?prototype=tour`. Keep the default game and `?prototype=bay`, `?prototype=station`, and `?prototype=garden` unchanged. Production must still ignore all prototype selectors and expose no test bridge.

Follow [AGENTS.md](../AGENTS.md): the primary agent designs and independently verifies; GPT-6 / medium-effort subagents implement and repair code.

## Current implementation and verification status

The connected Tour and destination compass are implemented on `prototype/three-stop-tour`, built on accepted slices `412ef66`. The **2026-09-09 (Windows local date) left-context/soft-glass follow-up** is implemented, primary-verified and owner-visually accepted for this checkpoint over previous published baseline `aa853e6`. It changes only `src/ui.ts` + `src/style.css` and permanent UI regressions, not welcome layout or gameplay. See the [current iteration handoff](iteration-plan.md#current-left-context-and-soft-glass-iteration--2026-09-09) for **192 unit / 89 distinct grouped development / final 6 production** passing results, measured geometry, contrast limits and the confirmed reduced-motion transition repair. Use the existing clone/switch/pull workflow and `git log -1 --oneline` to identify the actual received revision. The primary owns Git execution and remote-SHA verification; no new push success or SHA is claimed here. The previous main/Pages baseline remains `8656d31`; production remains original-only.

The **current destination rule supersedes earlier road-following verification**: in original/Bay/Station/Garden/Tour, the HUD compass uses vehicle-relative spherical heading to active `run.target.normal`. Name, distance and snapshot targets match that destination; roads feed hints/context and road-aware reverse-to-exit only. An arrow can point across water or obstacles; players choose routes. Shortest-arc smoothing, reduced motion, glass HUD and parking/recovery cues remain; a coincident airborne destination has no invented heading. Tour continuity/cargo/splits/checkpoints and accepted geometry/physics are unchanged.

**Historical primary-observed checks for `aa853e6` (2026-09-08, macOS, Node v24.13.1, npm 11.10.1, local Chrome; not worker-run):** **192/192 unit tests in 21 files**, TypeScript/production build, **85/85 development browser cases in one command (6.7 minutes, no skips)**, then **6/6 production-preview cases sequentially** passed. A fresh 320×640 Tour welcome repeat passed **3/3**. Only the existing nonblocking >500kB bundle warning remains. This supersedes the earlier Windows **42 + 1 + 42** single-run limitation; those observations remain [historical](iteration-plan.md#historical-destination-compass-verification--windows-checkpoint), with no claim of a permanent Windows startup fix or actual Safari/WebKit execution.

The historical `aa853e6` refinement changes application code only in `src/style.css` and permanent tests only in `tests/browser/ui-readability.spec.ts`. Compact-portrait spacing reclaims **20px**: the 320×640 Tour globe is **177.65625px** with unchanged text/CTA sizes and clearances. Before this repair, the macOS full run completed **84/85** with the globe at **157.65625px vs ≥170**, repeated **3/3**—a real layout assertion, not the historical Windows timeout. HUD widths are 70% of their former responsive bounds and initial heights about 70%, using real layout rather than component scaling. Long copy wraps at readable minimums, and lighter `.56` glass retains full-opacity foregrounds and strict contrast/fallback checks. The primary measured bounds, opacity, contrast, no scaling and van clearance, and inspected desktop/phone/short-landscape screenshots. [Exact measurements and commands](iteration-plan.md#current-compact-hud-and-welcome-refinement--2026-09-08) are recorded once in the handoff. Main/UI TypeScript, active-destination compass, driving, geometry, sessions, records, camera rules and control hit targets are unchanged. No welcome/contrast gates were relaxed or timeouts increased; real-input complete Tours and closing-road checks remain passing.

**The current left-hint/left-toast/light-frost visual treatment is now accepted/frozen as the baseline, separately from the earlier `aa853e6` approval.** Next, recommend an owner-driven real-input **Bakery → Station → Garden → closing road** playtest, including at least a recovery/restart check, to assess destination-compass usability, road handoffs, left-side hints during actual driving and whole-journey pacing. Visual praise and automated checks do not satisfy these gameplay gates. Do not default to new features or further cosmetics. If gameplay is accepted, production promotion/main merge/Pages can be proposed separately, still requiring explicit authorization.

## Historical Tour integration verification — before destination compass

The following results and then-current no-commit status are historical; they do not override the current handoff or destination rule above.

Implementation is complete for local Tour playtesting on `prototype/three-stop-tour`, based on `412ef66`. Open **http://127.0.0.1:5173/?prototype=tour** in development mode. The coordinator independently verified the integrated implementation after both workers completed:

- `npm test`: **168 unit tests passed in 17 files**.
- `npm run build`: TypeScript and production build passed, with only the existing non-blocking bundle-size warning. An earlier build also emitted a one-off plugin-timing diagnostic, not a failure.
- `npm run test:browser -- tests/browser/tour.spec.ts --output=artifacts/tour-review/browser`: **all 4 focused Tour cases passed**.
- `npm run test:browser -- --output=artifacts/tour-review/full-browser`: **all 20 development cases passed**, including the original game, all single slices, both complete real-input Tours and their closing road, checkpoints, pause/early restart, and 320px touch/focus/recipient visibility.
- `npm run test:preview -- --output=artifacts/tour-review/production`: **all 6 cases passed**, including Tour and unknown selectors keeping the original game with no test bridge.
- Desktop handoff/end screenshots for all three locales and the 320px final UI were reviewed.
- An additional independent smoke check used only visible HUD text/arrow and physical keyboard events on `/?prototype=tour`, with no test bridge or route fixtures. It completed all three deliveries, final HUD **03/03** at approximately **00:26**, with no browser errors. This was automated keyboard verification, **not an owner/human playtest or a claim that the Tour is fun**.

These are coordinator results, not checks run by the documentation-only finish worker. The primary authored `AGENTS.md` and `CLAUDE.md` at the owner's request; all application/test implementation came from GPT-6 subagents configured with medium effort. See the [iteration handoff](iteration-plan.md) for current readiness and the preserved accepted-slice feedback and records.

No commits, pushes, merges or deployments have been made this iteration; public Pages remains untouched. **Owner feedback on the connected journey and explicit release authorization remain pending.** The approved plan below remains the design and acceptance reference, not a claim of release or owner acceptance.

## Player experience

- All three authored locales coexist on one planet. Drive between them on visible connecting roads: no scene swaps, teleports, or vehicle resets at delivery boundaries.
- Preserve each accepted local route's geometry, scale, physics, two alternatives, and world reaction. Tour placement may change the locale's anchor only; standalone defaults stay unchanged.
- Start with three visible parcels. Each handoff consumes one parcel and animates the corresponding recipient; remaining cargo stays on the van.
- Update the next destination and navigation immediately after a handoff without opening an intermediate results modal or waiting for the animation.
- Count total active journey time and three leg splits. A split starts at departure or the previous delivery, so transfer driving and any voluntary wait belong to the following leg. Pauses are excluded; recovery does not reset or add an artificial penalty. Splits sum to the final total.
- After the third delivery, freeze scoring and show a compact, non-blocking total/splits/best summary. Keep driving available, or restart the entire tour.
- Connect Garden back to Bay's starting area for free roaming. Returning is not a fourth task and is not required for completion.
- Preserve free off-road driving. No mandatory route checkpoints, invisible lane walls, new grip rules, extra driving buttons, or progression systems.

## Safe recovery

R and automatic recovery use the latest **actually reached** canonical safe point:

1. Initially, Bay's entry pose.
2. After a delivery, that delivered pad, oriented toward its outgoing connector.
3. Only after physically reaching the next locale's entrance zone while grounded, that locale's entry pose.

Do not advance recovery to an unvisited future stop or allow R to skip a transfer. Delivery itself does not require passing the entrance marker: free exploration remains valid. Recovery preserves delivered parcels, splits, and elapsed time. Restart resets all journey state, cargo, reactions, navigation caches, and checkpoints.

## Layout decisions

Keep the global planet radius and accepted driving tuning unchanged. Initial Tour-only anchor candidates:

| Locale | Latitude | Longitude |
| --- | ---: | ---: |
| Bay | 20 | 0 |
| Station | -8 | 125 |
| Garden | 28 | -115 |

A primary-agent boundary-sampling check found no footprint overlap and a smallest local boundary gap of about 6.58 units. Revalidate against real definitions, renderer geometry, and colliders. Adjust Tour placements/connectors if needed, not accepted local courses or handling.

Connect each delivery pad through a safe local exit and an exterior arc to the next entrance. Initial exit/entry candidates in each locale's own frame:

- Bay outgoing: pad `(8.9,0)` toward `(13.5,0)`.
- Station incoming: `(-14.5,0)` to spawn `(-11,0)`; outgoing: pad `(0,0)` toward `(5,0)`.
- Garden incoming: `(-16.5,0)` to spawn `(-13,0)`; outgoing: pad `(0,0)` toward `(5.5,0)`.
- Bay return approach: `(-12.5,0)` to spawn `(-8,0)`.

These are starting points, not exceptions to safety tests. Connector samples, render geometry, navigation, and support must agree. Connector roads must not cross Bay water or intersect buildings/beds. Use authored samples before a generic ground fallback; never treat an individual locale's global fallback as proof it owns every point on the planet.

## Implementation phases and ownership

### A. Domain model and shared contracts

First implementation subagent owns:

- `src/tour-layout.ts`, `src/tour-session.ts`, their tests, and only the necessary compatible constructor changes in `src/bay-level.ts`, `src/station-level.ts`, and `src/garden-level.ts`.
- Optional placement overrides must not mutate the exported default definitions, route arrays, or saved records.

Required domain capabilities:

- Ordered stop descriptors with stable kind, level instance, destination, entry pose, and delivered-pad recovery pose.
- Three sampled connector paths with widths, connecting Bay→Station→Garden→Bay. Include per-leg complete route fixtures combining transfer and each local wide/short alternative.
- A composite `sampleSurface` and `crossRampLip` interface, plus footprint/connector clearance and route-aware navigation helpers.
- A `TourSession` that reuses `DeliveryRun` delivery eligibility, tracks splits and earned checkpoints, and resets without changing the existing session policy for other modes.
- Export `TOUR_RECORD_KEY = 'tiny-planet-courier:tour:best:v1'`. Only a completed tour updates this record; do not write single-slice records.

The implementer chooses clear exact signatures and returns them. The primary agent reviews and freezes that contract before B/C begin.

### B. World assembly and reactions

Second implementation subagent owns `src/world.ts`, scene-specific helper/test files if needed, and no main/UI/controller files.

- Support `new PlanetWorld('tour', reducedMotion)` with `tourLayout`, ordered destinations, one composite driving environment, and a way to set the environment's recovery pose from the session.
- Parameterize rendering helpers with the owning locale instead of relying on one `authoredLevel`. For Tour, do not accidentally choose Garden's prefix/radius/transform for every locale simply because all three fields exist.
- Build one base planet/background, all three districts, and their connecting roads. Clip/filter legacy roads and scenery against all active districts and connectors; do not combine three complete `PlanetWorld` scenes.
- Dispatch `startDelivery(parcelStart, index)` and reaction snapshots by destination index. Preserve current single-slice index-zero behavior, reset compatibility, and private animated materials.
- Keep previous handoffs completed while moving on. Reset all three reactions only on a fresh tour.

### C. Main flow, cargo, UI, documentation and browser coverage

Third implementation subagent owns `src/main.ts`, `src/ui.ts`, `src/style.css`, `src/vehicle.ts`, `src/delivery-prototypes.ts`, associated integration/browser tests, README, and iteration-handoff updates. It must consume the reviewed A/B interfaces, not alter their owned files while B runs.

- Register the DEV-only Tour selector and identity; preserve production gating and all existing single-slice identifiers/copy.
- Use the tour session/environment without resetting the van or replacing the world between stops.
- Extend the visual cargo API compatibly: three tour parcels, one consumed per handoff, accurate world-space handoff origin, correct reset and recovery behavior. Preserve existing single-parcel methods for the old modes.
- Make navigation, local hints, route-choice cache, and recovery messages follow the active leg rather than a constructor-captured single locale.
- Show intermediate progress without a blocking results card; show total and three splits only at the end. Preserve control and focus, including 320px touch layouts.
- Update documentation and tests. Permanent tests are implementation work; the primary agent will independently run them and inspect screenshots.

B/C may run in parallel with non-overlapping file ownership. Do not run full browser/preview suites or builds while another worker is changing the app. Cross-file integration corrections go to one implementation subagent after both finish.

## Acceptance checks

- Preserve the existing baseline behaviors: 131 unit tests, 16 development-browser cases, and 5 production-isolation cases, plus new Tour coverage.
- No district overlap, invisible bridges, blocked connector lanes, inconsistent contact heights, or duplicated base scenes.
- Drive two complete tours with real controller inputs, covering wide alternatives and the Bay leap/Station inner/Garden flower alternatives. No teleport-based proof of continuity. Also validate the free-roam closing connector.
- Accept only the active delivery, exactly once; cargo goes 3→2→1→0; each correct world reaction runs independently.
- Splits sum to total; pause/recovery/restart/early restart work; no unvisited checkpoint teleport and no lost completed deliveries.
- Finish remains drivable; all reactions and cargo reset together on restart; repeated runs do not cause permanent scene-object growth.
- Inspect camera, lighting, navigation readability, handoff visibility and controls at every district, on desktop and narrow screens.
- Production query `?prototype=tour&test=1` still shows the original game with no test bridge.

## Verification ownership

The primary agent reviews actual changes and runs unit tests, browser tests and production-preview checks **sequentially**, inspecting screenshots and runtime errors. If anything fails, provide a reproduction and constraints to a GPT-6 / medium-effort implementation subagent; do not bypass the collaboration policy by patching application code in the coordinator.

The owner's 2026-09-09 approval and explicit checkpoint/push request now cover the CURRENT primary-verified left-hint/left-toast/light-frost version over previous published baseline `aa853e6`, separately from that earlier checkpoint's approval. HUD visuals are accepted/frozen; the next gate is the owner-driven complete Tour and recovery/restart playtest described above, not more cosmetic work. Final destination-compass and connected-journey gameplay acceptance remain pending; prototype promotion, main merge and deployment still require separate explicit authorization.
