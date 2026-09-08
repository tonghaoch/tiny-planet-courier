# Navigation stability — destination-compass follow-up

## Current product rule — 2026-09-08

The owner clarified that the arrow must **always point to the active delivery destination when steering is shown**, not to a safe path or a lookahead waypoint. Players choose roads and avoid water/obstacles. This supersedes the road-following steering and HUD-only autopilot acceptance requirements in the historical plan below; it does **not** supersede parking/recovery stability, shortest-arc animation or existing route-playability safeguards.

- All five modes use `headingTo(vehicle.normal, vehicle.forward, run.target.normal)`, guarded for a coincident destination. The HUD name and distance refer to that same active destination. Handoffs retarget immediately; R, automatic recovery, restart and home cannot restore an old waypoint or destination.
- `updateRouteContext` retains branch/cursor/phase caches only for road-choice/transfer hints and compatibility diagnostics. It does not return a waypoint to the compass. The Tour reverse-to-exit hint still uses the road's bearing, not the new direct-destination bearing.
- `navigationTarget` and `guidance.target` now mean the active delivery destination. Canonical/direct bearings and the HUD command agree whenever steering is shown; the displayed heading retains its shortest-arc animation. Snapshots remain passive and returned diagnostics isolated.
- Parking P/brake/hold/move-back cues, recovery suppression, pause/home/completed visibility and reduced motion are unchanged. The separate CSS-only compact/glass refinement below does not change compass behavior, geometry, physics, route alternatives, gameplay sessions or delivery thresholds.
- Navigation tests explicitly compare against destinations, including road bends with substantially different path bearings, off-road/Bay-across-water positions, movement/turning in all modes and Tour next-stop transitions. Four old HUD-only pilots are replaced by real-controller path-fixture travel with destination-bearing assertions; the compass alone is not expected to avoid obstacles. Isolated pose fixtures are not playability evidence. Existing route-playability tests remain unchanged.

**Current verification — compact-HUD/welcome refinement, 2026-09-08:** the primary independently reviewed and verified the changed checkout on macOS with Node v24.13.1, npm 11.10.1 and local Chrome (`PLAYWRIGHT_CHANNEL=chrome`). **192/192 unit tests in 21 files**, TypeScript/production build, **85/85 development browser cases in one command (6.7 minutes, no skips)** and then **6/6 production-preview cases sequentially** passed. A fresh 320×640 Tour welcome repeat passed **3/3**. Only the existing nonblocking >500kB bundle warning remains. These are primary-observed results, not tests run by either refinement worker.

Application code changed only in `src/style.css`; permanent tests changed only in `tests/browser/ui-readability.spec.ts`. Welcome spacing reclaims **20px**, bringing the 320×640 Tour globe from **157.65625px to 177.65625px** with unchanged copy/type/CTA sizes and retained clearances. Before the change, a macOS full run completed **84/85**, and the same ≥170px layout failure repeated **3/3**; it was not the historical Windows startup timeout. The HUD now uses real responsive layout at 70% previous width and about 70% initial height, not component transform/zoom scaling. Long strings wrap; readable type floors and centered arrows remain. Normal glass changes from `rgba(16, 40, 47, .63)` to `rgba(2, 8, 10, .56)` with unchanged 5px blur / 1.08 saturation, fully opaque text/arrow and unchanged disc backing. Actual-style minimum white-background contrast is **4.58575:1 text / 5.39172:1 arrow**; ≥4.5/≥3 assertions remain. Fallback/reduced transparency retain `.96` dark-teal backing without blur or geometry shifts.

Main/UI TypeScript, compass/animation semantics, driving, route geometry, sessions, records, camera rules and control hit targets are unchanged. Only intentional HUD dimension/type/normal-color expectations changed, with rendered-bounds/no-scaling guards added; no contrast/welcome relaxation or timeout increases. The primary separately measured bounds, contrast, opacity, no component scaling and van clearance, inspected desktop/320px/844px screenshots, and verified navigation plus real-input complete Tours/closing road. See the [handoff measurements and commands](iteration-plan.md#current-compact-hud-and-welcome-refinement--2026-09-08).

**Historical Windows destination-compass checks:** the earlier **42 + 1 + 42** observations covered all 85 distinct cases but were not a single full pass. The interrupted 320px case timed out in initial `page.goto` before layout/gameplay assertions; fresh-browser repeats and the separate UI suite passed. The new macOS 85/85 run supersedes that current verification limitation, not the historical record. No permanent Windows startup fix or actual Safari/WebKit execution is claimed; [full historical details](iteration-plan.md#historical-destination-compass-verification--windows-checkpoint) remain in the handoff.

In that earlier destination-compass phase, the initial navigation run was 20/23; three bounded test repairs retained strict browser-target equality, allowed 12-decimal tolerance for independently generated Node coordinates (around 1e-16 `Math.sin` difference), and waited for normal captured guidance after R. All three affected cases then passed. The primary independently compared actual rendered DOM arrow angles to a destination-bearing formula in all five modes, both Tour transitions and mobile, with no browser errors, and reviewed desktop/mobile screenshots. These fixtures isolate navigation/UI; real-controller route tests establish playability. A coincident airborne destination has no invented heading.

**Visual approval and checkpoint request — 2026-09-09:** the owner positively approved the small-screen welcome repair and compact, more-transparent HUD and explicitly requested updated handoff docs plus commit/push on `prototype/three-stop-tour`. This checkpoint adds the verified CSS/test refinement and docs over **previous published baseline `56c92fc`**; the application/test diff remains unchanged from the 2026-09-08 verification. The primary performs and verifies the pending Git operations; no successful push or future hash is claimed here. After publication, use the [current cross-computer handoff](iteration-plan.md#current-checkpoint-and-cross-computer-handoff--2026-09-08) to clone/update and `git log -1 --oneline` to identify the received revision. Visual approval does **not** establish final destination-compass or complete Tour gameplay acceptance; those gates remain pending. No prototype promotion, main merge or Pages deployment is authorized. Development-browser and production-preview checks must run sequentially.

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
