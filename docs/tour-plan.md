# Tour plan — five-location release and three-stop history

## Current five-location, ten-delivery contract

**2026-09-11: five-location release authorized.** After accepting the preview visuals, the owner explicitly requested: “很好，帮我发布到main，记得更新README和截图” (“Great, publish it to main, and remember to update README and screenshots”). This authorizes main publication and the documentation/image refresh; it does not claim a personal full ten-delivery playthrough. Validation was recorded on `feat/five-location-tour` from released engineering baseline `d5a7985`, before committing. The primary owns the feature-branch commit, main fast-forward/push, exact-SHA Actions/Pages verification and independent public-site smoke. Authorization is not a claim that deployment has succeeded; no additional approval gate is required. Historical permissions below retain their original release boundaries.

### World and routes

Five physical sites coexist on one radius-15 planet. Sunrise Bakery, Stargaze Station and Windmill Garden retain their accepted local definitions, Tour anchors and driving tuning. New southern **Beacon Post** receives a replacement lamp; **Redrock Depot** receives repair supplies. Existing route identities remain: Bay approach/leap/landing, Station braking and line choice, Garden linked turns.

The authored directed graph keeps **Bay → Station → Garden → Bay** and adds **Station → Depot → Beacon → Station**. It supports routing between all sites; it is **not an imposed traffic rule**. Free driving remains. Transit uses safe ground routes (Bay coast, other inner paths), never a reverse Bay leap. The compass still points directly to the active destination; roads supply context, not a safe-road steering arrow. Expansion occupies new southern space without increasing global radius; [architecture measurements](architecture.md#measured-physical-extent-and-world-root-cost) distinguish summed centerlines from paved area.

### Immutable offer and repeat visits

- Ten occurrences comprise **two shuffled bags of all five locations**: exactly two visits per site, no destination matching either of the prior two, and no repeated directed delivery pair in the nine transitions.
- Bounded enumeration finds **20 valid second bags per first permutation**. Home/new Tour offers a fresh random draw, not a guaranteed globally unique itinerary. Start/Restart retries the exact offered plan.
- `tourSeed` is a **DEV + test-only** override, e.g. `/?test=1&tourSeed=227`. Production ignores all prototype/test/seed overrides and exposes no bridge.
- Location ID, occurrence index and legacy `destination.id` are distinct. `TourLayout` catalogs five sites; `TourSession.destinations` represents ten occurrences. Session plan/location IDs, occurrence-bearing splits and typed World location wrappers preserve that boundary.
- Ten compact roof parcels are consumed one at a time from their exact handoff origins. Repeat visits reset/replay only that site's reaction; delivery never swaps the scene or resets the van.
- Each leg resets entrance-checkpoint earning. Only actual grounded arrivals/transit earn recovery; previous visits do not allow skipping a transfer. Recovery keeps cargo, splits and active time intact.
- Ten completions freeze scoring, not driving. Transfers count toward the next split and pauses are excluded. Native results details start collapsed, with bounded scroll and compact portrait/short-landscape forms preserving van, recipient, controls, 12px result text and 44px targets. Restart clears journey state/reactions while retaining the plan.

Best times are scoped to **layout/scoring/start/ordered itinerary**, not seed or a global three-stop record:
`tiny-planet-courier:tour:best:five-location-v2:score-v2:bay-entry:<ordered IDs>`.
Old keys remain untouched. Prototype Tour `bestScoreKey` is `null`; results receive the real session key.

### Current implementation and evidence boundary

Existing entry points remain, with `tour-itinerary.ts`, `tour-outposts.ts`, `outpost-reaction.ts` and `world/outpost-scene.ts`; no new runtime dependencies. The shared page-RAF controller in `tests/helpers/tour-browser-driver.ts` is **test-only**, not a runtime autopilot or physics change. Follow [AGENTS.md](../AGENTS.md) and the [domain/architecture contracts](architecture.md).

**Primary-supplied final evidence, not documentation-worker runs:** full `verify` passed (487 Vitest tests in 35 files, 11 Node audit tests, static checks/build/audits); **104 distinct DEV cases passed across sequential fresh-process groups on one unchanged candidate**, not one successful 104/104 invocation; then **24/24 production cases passed**. SHA256 confirmed 123 source/config/build files unchanged across accepted observations. Real controller checks cover all 20 ordered site pairs, all five departures, old/new alternatives and complete ten-stop routes; browser wide seed 9 and short seed 55 include the Garden→Bay closing road, and navigation seed 227 completes ten. Docking fixtures prove UI/state only.

The [release checkpoint](iteration-plan.md#five-location-release-checkpoint--2026-09-11) contains exact groups, failure/repair history, the 4175 production-config exception, smoke evidence and limitations. Actual Safari/WebKit and hardware phones were not tested; remote CI/deployment were outside that local validation. README screenshots now show the five-location production build at **http://127.0.0.1:4173/tiny-planet-courier/**: a settled ten-parcel welcome and genuine early Bay driving toward the randomly offered Sunrise Bakery, not a view of all five sites or a complete Tour. [Capture provenance](iteration-plan.md#five-location-screenshot-provenance--2026-09-11) records the exact assets and checks. The primary separately confirms publication.

---

## Historical three-stop release — 2026-09-09

**Everything below preserves the three-stop design/release history.** Its three-parcel counts, fixed order, global record, former DEV-only requirements and release authorization are historical, not the current five-location contract. Past accepted routes and verification are retained without reopening their old approval gates.

### Historical scope and release boundary

**2026-09-09: owner acceptance and release authorization are complete.** The owner has accepted the HUD and personally completed the connected **Sunrise Bakery → Stargaze Station → Windmill Garden** Tour with no blocking issues. They explicitly requested the main merge and README screenshot refresh, then selected **Tour as the official public default with automatic GitHub Pages deployment**. No repeat owner-playtest or promotion-approval gate remains.

The release preparation follows reviewed prototype checkpoint **`59e5263`**, with pre-release main **`8656d31`**. Use **`main`** for the official game and cross-computer continuation; `prototype/three-stop-tour` records historical development from accepted slice baseline `412ef66`. The primary owns committing/fast-forwarding/pushing the prepared release and independently verifying CI and the live site for the exact SHA. This plan does not claim publication already succeeded or invent a release SHA.

Both bare development and production roots now select Tour. Production ignores **all** prototype query overrides and never exposes the test bridge. DEV retains explicit `?prototype=bay|station|garden|tour` and `?prototype=standard` for the original comparison; missing, empty or unknown DEV selectors default to Tour. Tour's release copy is **THREE-STOP TOUR**, **Three stops. One big day.**, **READY TO GO**, with plural parcels in pause copy. Standalone local experiments retain playtest branding.

Follow [AGENTS.md](../AGENTS.md): the primary agent designs and independently verifies; GPT-6 / medium-effort subagents implement and repair code. This release does not retune the accepted HUD/style, navigation, route geometry, driving, camera, checkpoints, sessions, records or DEV bridge guards.

<a id="current-implementation-and-verification-status"></a>

## Historical three-stop implementation and verification status

**Primary-supplied release evidence, not suites run by the documentation/capture worker:**

- **228/228 unit tests in 21 files** and TypeScript/production build passed; existing >500kB warning only (**JS 684.30kB / gzip 181.68kB**).
- **All 90 distinct development cases passed in sequential groups:** UI compact **26** + desktop **21** = **47**, navigation **23**, game/Tour **10**, standalone **10**. This was **not one all-in-one 90/90 run**.
- **15/15 production cases passed:** 13 default/query cases plus actual keyboard lifecycle and narrow pointer input.
- Separate primary production-preview inspection recorded **6 desktop/phone URL observations**, no bridge, real keyboard movement/pause/recovery/restart and mobile Start, with no page errors. The local-only record is `artifacts/tour-release/preview-verification.json`; a smoke check is not a complete production playthrough.

The documentation worker replaced only the two README JPEGs after inspecting the older originals. Both are real **1440×900, scale-1, quality-90** JPEG captures from the already-running production preview in a fresh Edge context: settled Tour welcome and early Bay driving after normal Start/W input. HTTP 200, ready Tour, no bridge or PLAYTEST copy, and zero page/console errors were observed. No teleport, DOM/style changes or generated imagery was used. [Exact capture provenance, sizes, input timing and local-only artifact boundaries](iteration-plan.md#release-screenshot-provenance--2026-09-09) are recorded in the handoff. This worker ran no unit/browser suites, install/build, Git or deployment commands, and started/stopped no server.

Use the [main-based clone/fetch/switch/pull instructions](iteration-plan.md#continue-on-another-computer), then `git log -1 --oneline` to identify the received revision. Play locally at **http://127.0.0.1:5173/**, preview production at **http://127.0.0.1:4173/tiny-planet-courier/** after building, or use **https://tonghaoch.github.io/tiny-planet-courier/** for online play. Publication confirmation is the primary's separate exact-SHA release report.

The **current destination rule supersedes earlier road-following verification**: in original/Bay/Station/Garden/Tour, the HUD compass uses vehicle-relative spherical heading to active `run.target.normal`. Name, distance and snapshot targets match that destination; roads feed hints/context and road-aware reverse-to-exit only. An arrow can point across water or obstacles; players choose routes. Shortest-arc smoothing, reduced motion, glass HUD and parking/recovery cues remain; a coincident airborne destination has no invented heading. Tour continuity/cargo/splits/checkpoints and accepted geometry/physics are unchanged.

### Historical presentation checkpoints

The left-context/soft-glass HUD at **`59e5263`** followed **`aa853e6`, `Compact navigation HUD and fix mobile welcome layout`**. The owner separately accepted both visual iterations; the later complete-Tour acceptance and official release authorization above supersede their former pending-gameplay/no-promotion boundaries. [Historical soft-glass evidence](iteration-plan.md#current-left-context-and-soft-glass-iteration--2026-09-09) records **192 unit / 89 distinct grouped development / final 6 production** passes, measured geometry, contrast limits and the reduced-motion transition repair. Those are not the new release's results.

**Historical primary-observed checks for `aa853e6` (2026-09-08, macOS, Node v24.13.1, npm 11.10.1, local Chrome; not worker-run):** **192/192 unit tests in 21 files**, TypeScript/production build, **85/85 development browser cases in one command (6.7 minutes, no skips)**, then **6/6 production-preview cases sequentially** passed. A fresh 320×640 Tour welcome repeat passed **3/3**. Only the existing nonblocking >500kB bundle warning remained. This superseded the earlier Windows **42 + 1 + 42** single-run limitation; those observations remain [historical](iteration-plan.md#historical-destination-compass-verification--windows-checkpoint), with no claim of a permanent Windows startup fix or actual Safari/WebKit execution.

The historical `aa853e6` refinement changed application code only in `src/style.css` and permanent tests only in `tests/browser/ui-readability.spec.ts`. Compact-portrait spacing reclaimed **20px**: the 320×640 Tour globe measured **177.65625px** with unchanged text/CTA sizes and clearances. Before this repair, the macOS full run completed **84/85** with the globe at **157.65625px vs ≥170**, repeated **3/3**—a real layout assertion, not the historical Windows timeout. HUD widths became 70% of former responsive bounds and initial heights about 70%, using real layout rather than component scaling. Long copy wrapped at readable minimums; that checkpoint's `.56` glass retained full-opacity foregrounds and strict contrast/fallback checks. [Exact measurements and commands](iteration-plan.md#current-compact-hud-and-welcome-refinement--2026-09-08) remain in the handoff. No welcome/contrast gates were relaxed or timeouts increased; real-input complete Tours and closing-road checks passed.

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

**Historical status at Tour integration:** no commits, pushes, merges or deployments had been made in that iteration; owner feedback and release authorization were still pending then. These are now closed as recorded above. The original development plan below preserves its design and acceptance history; its DEV-only entry and original-only production requirements were superseded by the official Tour release contract.

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

**At that historical three-stop checkpoint**, the HUD and connected journey were owner-accepted, with no blocking issues reported after the owner's complete Tour. Main promotion, screenshot refresh and automatic Pages deployment were explicitly authorized for that release only. Preserve the accepted baseline; the primary verifies source/test integrity, actual publication and exact SHA separately. Historical DEV-only requirements and pending acceptance language do not reopen old release gates. The five-location release has its own explicit 2026-09-11 authorization recorded at the top.
