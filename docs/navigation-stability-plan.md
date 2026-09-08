# Navigation stability — destination-compass follow-up

## Current product rule — 2026-09-08

The owner clarified that the arrow must **always point to the active delivery destination when steering is shown**, not to a safe path or a lookahead waypoint. Players choose roads and avoid water/obstacles. This supersedes the road-following steering and HUD-only autopilot acceptance requirements in the historical plan below; it does **not** supersede parking/recovery stability, shortest-arc animation or existing route-playability safeguards.

- All five modes use `headingTo(vehicle.normal, vehicle.forward, run.target.normal)`, guarded for a coincident destination. The HUD name and distance refer to that same active destination. Handoffs retarget immediately; R, automatic recovery, restart and home cannot restore an old waypoint or destination.
- `updateRouteContext` retains branch/cursor/phase caches only for road-choice/transfer hints and compatibility diagnostics. It does not return a waypoint to the compass. The Tour reverse-to-exit hint still uses the road's bearing, not the new direct-destination bearing.
- `navigationTarget` and `guidance.target` now mean the active delivery destination. Canonical/direct bearings and the HUD command agree whenever steering is shown; the displayed heading retains its shortest-arc animation. Snapshots remain passive and returned diagnostics isolated.
- Parking P/brake/hold/move-back cues, recovery suppression, pause/home/completed visibility, reduced motion and the accepted glass HUD are unchanged. No geometry, physics, route alternatives, gameplay sessions or delivery thresholds change.
- Navigation tests explicitly compare against destinations, including road bends with substantially different path bearings, off-road/Bay-across-water positions, movement/turning in all modes and Tour next-stop transitions. Four old HUD-only pilots are replaced by real-controller path-fixture travel with destination-bearing assertions; the compass alone is not expected to avoid obstacles. Isolated pose fixtures are not playability evidence. Existing route-playability tests remain unchanged.

**Current verification: primary independent checks completed; owner hands-on feedback remains pending.** Primary-supplied results (not run by the documentation-only worker): **192 unit tests in 21 files**, TypeScript/production build and **6/6 production-isolation cases** passed. The build retains only the existing >500kB bundle warning. **All 85 distinct development cases have passing observations across sequential runs (42 + 1 + 42), not a clean 85/85 single-command pass.** The first 42 included all 23 navigation cases and desktop real-input Tours; the full command was stopped after case 43 timed out in initial `page.goto`, before gameplay/layout assertions. That identical 320px Tour then passed **3/3** in fresh browsers without code or timeout changes; the separate UI suite passed **42/42** after a webServer startup issue was handled by checking port ownership and starting Vite. No product regression or permanent environment fix is established.

The initial navigation run was 20/23; three bounded test repairs retained strict browser-target equality, allowed 12-decimal tolerance for independently generated Node coordinates (around 1e-16 `Math.sin` difference), and waited for normal captured guidance after R. All three affected cases then passed. The primary independently compared actual rendered DOM arrow angles to a destination-bearing formula in all five modes, both Tour transitions and mobile, with no browser errors, and reviewed desktop/mobile screenshots. These fixtures isolate navigation/UI; real-controller route tests establish playability. A coincident airborne destination has no invented heading.

**The owner authorized this branch checkpoint/push** on `prototype/three-stop-tour`; the primary performs and verifies Git separately. This is not owner gameplay acceptance or authorization to promote prototypes, merge `main` or deploy Pages. See the [current cross-computer handoff](iteration-plan.md#current-checkpoint-and-cross-computer-handoff--2026-09-08) for setup, `git log` revision identification, full results and fresh-process reproduction commands. Run development-browser and preview checks sequentially; prefer separate files/suites in fresh processes if this Windows host's long-lived Edge session stalls page loads.

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
