# Navigation stability — destination-compass follow-up

## Official Tour release — 2026-09-09

**Owner acceptance and release authorization are complete.** The owner accepted the HUD and personally completed Tour with **no blocking issues**, then explicitly requested the main merge and README screenshot refresh and confirmed **Tour as the official public default with automatic Pages deployment**. The former destination-compass/whole-journey owner-playtest gates are closed; no repeat acceptance is needed.

This release preparation follows reviewed prototype checkpoint **`59e5263`** and pre-release main **`8656d31`**. **`main` is the active official-game workflow**; the prototype branch is historical development context. The primary owns commit/fast-forward/push and exact-SHA CI/public-site verification. This document claims neither completed publication nor a new SHA. Use the [main-based clone/fetch/switch/pull handoff](iteration-plan.md#continue-on-another-computer), then `git log -1 --oneline` to identify the received revision.

Both bare roots now default to Tour: development **http://127.0.0.1:5173/** and production preview **http://127.0.0.1:4173/tiny-planet-courier/**. Online play is **https://tonghaoch.github.io/tiny-planet-courier/**; the primary verifies the public revision separately. Production ignores all prototype query overrides and never exposes `__planetTest`. DEV retains explicit `bay`, `station`, `garden`, `tour` and `standard` (original comparison), with missing/empty/unknown selectors falling back to Tour. Public Tour uses **THREE-STOP TOUR / Three stops. One big day. / READY TO GO** and plural parcels in pause copy; local standalone experiments retain playtest branding. Accepted HUD/style, navigation, routes, driving, camera, checkpoints, session, records and DEV bridge guards are unchanged.

**New primary-supplied release evidence, not suites run by the documentation/capture worker:** **228/228 unit tests in 21 files**, TypeScript/build passed (existing >500kB warning only; **JS 684.30kB / gzip 181.68kB**); **all 90 distinct development cases passed sequentially**—UI compact **26** + desktop **21** = **47**, navigation **23**, game/Tour **10**, standalone **10**—**not one all-in-one 90/90 run**. Production **15/15** passed: 13 query/default cases plus actual keyboard lifecycle and narrow pointer input. Separate primary preview inspection recorded **6 desktop/phone URL observations**, no bridge, real keyboard movement/pause/recovery/restart and mobile Start, with no page errors (`artifacts/tour-release/preview-verification.json`, local-only).

The refreshed README JPEGs are real **1440×900, scale-1, quality-90** production-preview captures from a fresh installed Edge context: settled welcome and early driving after normal Start/W input, showing the unchanged compass and left hints. HTTP 200, ready Tour, no bridge or PLAYTEST copy, and zero page/console errors were observed. There was no pose teleport, source fixture, DOM/style injection or image generation; the driving frame is not a complete-playthrough claim. [Exact sizes, timing and screenshot provenance](iteration-plan.md#release-screenshot-provenance--2026-09-09) are in the handoff. Only the two selected JPEGs are maintained assets; capture scripts/candidates are ignored under `artifacts/tour-release/`. This worker ran no unit/browser suites, install/build, Git or deploy commands and started/stopped no server.

## Current product rule — 2026-09-08

The owner clarified that the arrow must **always point to the active delivery destination when steering is shown**, not to a safe path or a lookahead waypoint. Players choose roads and avoid water/obstacles. This supersedes the road-following steering and HUD-only autopilot acceptance requirements in the historical plan below; it does **not** supersede parking/recovery stability, shortest-arc animation or existing route-playability safeguards.

- All five modes use `headingTo(vehicle.normal, vehicle.forward, run.target.normal)`, guarded for a coincident destination. The HUD name and distance refer to that same active destination. Handoffs retarget immediately; R, automatic recovery, restart and home cannot restore an old waypoint or destination.
- `updateRouteContext` retains branch/cursor/phase caches only for road-choice/transfer hints and compatibility diagnostics. It does not return a waypoint to the compass. The Tour reverse-to-exit hint still uses the road's bearing, not the new direct-destination bearing.
- `navigationTarget` and `guidance.target` now mean the active delivery destination. Canonical/direct bearings and the HUD command agree whenever steering is shown; the displayed heading retains its shortest-arc animation. Snapshots remain passive and returned diagnostics isolated.
- Parking P/brake/hold/move-back cues, recovery suppression, pause/home/completed visibility and reduced-motion navigation are unchanged. The current left-context/soft-glass presentation follow-up and historical CSS-only compact/welcome refinement do not change compass behavior, route geometry, physics, gameplay sessions or delivery thresholds.
- Navigation tests explicitly compare against destinations, including road bends with substantially different path bearings, off-road/Bay-across-water positions, movement/turning in all modes and Tour next-stop transitions. Four old HUD-only pilots are replaced by real-controller path-fixture travel with destination-bearing assertions; the compass alone is not expected to avoid obstacles. Isolated pose fixtures are not playability evidence. Existing route-playability tests remain unchanged.

**Accepted presentation checkpoint — 2026-09-09 (Windows local date):** the left hint/context stack, left toast and `.18` lightly frosted navigation at **`59e5263`** are independently verified and **owner-visually accepted/frozen**. That checkpoint's source scope was `src/ui.ts` + `src/style.css`, with permanent regressions only in `tests/browser/ui-readability.spec.ts`; destination bearings and gameplay were unchanged. See the [historical soft-glass handoff](iteration-plan.md#current-left-context-and-soft-glass-iteration--2026-09-09) for geometry, contrast limits, the reduced-motion transition repair, and **192 unit / 89 distinct grouped development / final 6 production** passing results. These counts and the macOS refinement below are historical, not the new release verification above.

**Historical verification — compact-HUD/welcome refinement, 2026-09-08:** the primary independently reviewed and verified the changed checkout on macOS with Node v24.13.1, npm 11.10.1 and local Chrome (`PLAYWRIGHT_CHANNEL=chrome`). **192/192 unit tests in 21 files**, TypeScript/production build, **85/85 development browser cases in one command (6.7 minutes, no skips)** and then **6/6 production-preview cases sequentially** passed. A fresh 320×640 Tour welcome repeat passed **3/3**. Only the existing nonblocking >500kB bundle warning remains. These are primary-observed results, not tests run by either refinement worker.

Application code changed only in `src/style.css`; permanent tests changed only in `tests/browser/ui-readability.spec.ts`. Welcome spacing reclaims **20px**, bringing the 320×640 Tour globe from **157.65625px to 177.65625px** with unchanged copy/type/CTA sizes and retained clearances. Before the change, a macOS full run completed **84/85**, and the same ≥170px layout failure repeated **3/3**; it was not the historical Windows startup timeout. The HUD now uses real responsive layout at 70% previous width and about 70% initial height, not component transform/zoom scaling. Long strings wrap; readable type floors and centered arrows remain. Normal glass changes from `rgba(16, 40, 47, .63)` to `rgba(2, 8, 10, .56)` with unchanged 5px blur / 1.08 saturation, fully opaque text/arrow and unchanged disc backing. Actual-style minimum white-background contrast is **4.58575:1 text / 5.39172:1 arrow**; ≥4.5/≥3 assertions remain. Fallback/reduced transparency retain `.96` dark-teal backing without blur or geometry shifts.

Main/UI TypeScript, compass/animation semantics, driving, route geometry, sessions, records, camera rules and control hit targets are unchanged. Only intentional HUD dimension/type/normal-color expectations changed, with rendered-bounds/no-scaling guards added; no contrast/welcome relaxation or timeout increases. The primary separately measured bounds, contrast, opacity, no component scaling and van clearance, inspected desktop/320px/844px screenshots, and verified navigation plus real-input complete Tours/closing road. See the [handoff measurements and commands](iteration-plan.md#current-compact-hud-and-welcome-refinement--2026-09-08).

**Historical Windows destination-compass checks:** the earlier **42 + 1 + 42** observations covered all 85 distinct cases but were not a single full pass. The interrupted 320px case timed out in initial `page.goto` before layout/gameplay assertions; fresh-browser repeats and the separate UI suite passed. The new macOS 85/85 run supersedes that current verification limitation, not the historical record. No permanent Windows startup fix or actual Safari/WebKit execution is claimed; [full historical details](iteration-plan.md#historical-destination-compass-verification--windows-checkpoint) remain in the handoff.

In that earlier destination-compass phase, the initial navigation run was 20/23; three bounded test repairs retained strict browser-target equality, allowed 12-decimal tolerance for independently generated Node coordinates (around 1e-16 `Math.sin` difference), and waited for normal captured guidance after R. All three affected cases then passed. The primary independently compared actual rendered DOM arrow angles to a destination-bearing formula in all five modes, both Tour transitions and mobile, with no browser errors, and reviewed desktop/mobile screenshots. These fixtures isolate navigation/UI; real-controller route tests establish playability. A coincident airborne destination has no invented heading.

**Historical checkpoint boundary:** `aa853e6`, `Compact navigation HUD and fix mobile welcome layout`, followed `56c92fc`. Its earlier visual approval/push was distinct from the owner's later enthusiastic praise of the left-context/soft-glass version and request to checkpoint/push it, resulting in reviewed prototype checkpoint `59e5263`. Those requests did not authorize production promotion at that time. The later owner-completed Tour with no blockers and explicit official-main/Pages authorization now supersede that restriction. Development-browser and production-preview checks still run sequentially.

**Current acceptance:** HUD and complete-Tour gameplay are accepted; preserve the baseline, rather than defaulting to cosmetics or new features. Primary verification of the exact published SHA and actual public game remains separate from acceptance and from this documentation/capture work.

## Historical approved correction plan

The following scope, reproductions and phases record the earlier road-following design. References to path targets and HUD-driven route completion below are historical, not the current product contract.

## Scope

The owner reported an inaccurate/wobbling arrow. Keep the current `prototype/three-stop-tour` worktree and all uncommitted Tour/readability/glass work. Follow AGENTS.md: primary agent diagnoses/designs/verifies; GPT-6 (`gpt-6-astra[1m]`) implementation subagents use explicit `medium` effort.

Do not alter driving physics, authored geometry, route alternatives, delivery eligibility/timing, records, gameplay camera, or the accepted glass HUD layout/opacity. No new minimap, mandatory route checkpoint, commit, push, merge, or deployment.

## Coordinator reproductions

- Bay Tour, local `x=-6`, forward along local north: moving from `y=1.299` to `1.301` (about0.002 world units) changes heading about83.4 degrees because `y<1.3` abruptly switches destination guidance to coast-road guidance. The position is on the usable coast road.
- Garden, inner route, clear of authored obstacles and on the actual road: local `(-7.540,1)` to `(-7.536,1)`, forward local east, produces about5.75 degrees of heading jump as a discrete lookahead point changes.
- Each pad, forward local east, at x offsets−0.02,0,+0.02: heading goes approximately0 → arbitrary−90 →180 degrees, while all positions are already eligible for parking. Steering toward a coincident target is undefined.
- Browser presentation reproduction using the actual unwrapping helper and current100ms CSS transition: command0→170 degrees, interrupt60ms later with−20. At interruption the rendered arrow was about56.7 degrees; instead of taking the short−76.7-degree turn it initially moved+113.3 degrees toward the unwrapped340-degree endpoint.

Glass styling does not change canonical heading. The intended bearing is relative to the van's forward vector, not the smoothed camera or reverse velocity; preserve that convention.

## A. Navigation core

Owned files: a small shared navigation/path helper and its tests, `src/road-level.ts`, `src/bay-level.ts`, `src/tour-layout.ts`, and necessary navigation-related unit tests. Do not edit main/UI/CSS/world/controller/session during this phase.

- Project onto route segments continuously, then look ahead by path arc length, initially preserving the approximately1.8-unit lookahead scale. Do not pick a discrete route sample as the target.
- Use explicit, resettable tracking/cache information where needed to avoid jumping between nearby segments under tiny positional noise. Do not make progress permanently monotonic: reversing, intentional route changes and off-road reacquisition must remain possible.
- Replace both Bay y=1.3 policies with one Bay navigation implementation. Select coast vs leap from actual route proximity and, where useful, supplied forward direction near the fork. Apply hysteresis/commit criteria rather than flipping on one coordinate threshold. Before a decision, keep shared-approach guidance stable and avoid a zero-length target.
- Preserve intentional choice between Station/Garden branches, but avoid weak/noisy flips. Tour transfer/local selection must also avoid boundary oscillation, while respecting stop changes and recovery resets.
- Keep existing call signatures compatible where practical; optional context containing forward/cursor is acceptable. Return clear cache data and exact integration signatures. Do not create hidden mutable navigation state that test reads can advance.
- Airborne guidance must not pull the van back toward a ground waypoint. No guidance change may affect the vehicle controller itself.

Required tests include the exact Bay and reachable Garden reproductions, projection/arc-length correctness, route changes and reacquisition, reverse movement, stop/region/cache invalidation, and unchanged delivery/course behavior. Canonical targets must be stable before adding any display filter.

## B. Integration and presentation

Owned files after A is reviewed: `src/main.ts`, `src/ui.ts`, necessary navigation-presentation helpers/CSS, and corresponding unit/browser tests and handoff documentation. Consume the reviewed core API; do not independently recreate route selection.

- Use the same core guidance for standalone and Tour instances. Supply current vehicle pose and maintain/reset caches intentionally on route context changes, stop changes, R/recovery, restart and home.
- Add a stable arrival/parking guidance state near the existing delivery circle while grounded. In that state, replace the direction arrow with a clear parking/delivery cue and appropriate brake/hold/move-into-ring text. Use a small entry/exit tolerance so boundary noise does not flash the state. Do not change the actual delivery radius, speed threshold or0.55-second dwell.
- Suppress meaningless steering during recovery. Stop/target changes must immediately restore the correct new guidance context.
- Animate toward the latest desired angle from the current displayed angle, with a short frame-rate-independent shortest-arc update. Remove conflicting CSS interpolation rather than stacking filters. No per-frame layout reads, no long steering lag, and immediate reduced-motion behavior.
- Fix observability: capture the actual route-aware heading/target/phase at normal guidance update time. Snapshot reads must be passive, not call navigation selection again. Clearly distinguish direct-destination bearing, HUD commanded bearing, and displayed bearing; preserve existing diagnostics compatibly if needed.
- Keep current typography, layout, glass treatment and control focus behavior unchanged apart from the semantic parking/recovery cue.

## Verification

The primary agent will independently verify:

1. Tiny pose noise does not reproduce the Bay83-degree or Garden5.75-degree jumps; genuine deliberate branch changes still work.
2. Near/crossing the pad center shows stable parking guidance without meaningless direction flips, with unchanged delivery eligibility.
3. Real browser animation under default motion takes the shortest direction when a transition is interrupted; reduced motion also works.
4. Stop changes, R, splashes, takeoff/landing, reverse driving, off-road return and repeated snapshot reads preserve correct state.
5. Navigation-driven route checks consume the actual guidance/HUD, not the existing fixture-aware route pilot. Existing physical-route tests remain useful but are not sufficient evidence for this fix.
6. Unit, gameplay/UI and production-isolation regressions run sequentially. Any implementation repair goes back to a GPT-6/medium subagent.

Owner hands-on feedback is still needed after the local algorithm correction; do not equate automated completion with perfect navigation feel.
