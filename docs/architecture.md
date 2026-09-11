# Architecture and development checks

This describes the **five-location, ten-delivery Tour architecture**.
See the [release checkpoint](iteration-plan.md#five-location-release-checkpoint--2026-09-11)
for verified local results and limitations; earlier engineering/release evidence remains historical.

## Scope and public boundaries

The game remains **vanilla TypeScript + Three.js + Vite**, with native HTML/CSS UI and
no new runtime dependencies. There is no React/ECS rewrite or global directory migration:
`src/main.ts`, `src/world.ts`, `src/ui.ts` and existing level/session/test entry points remain.
The accepted Bay, Station and Garden local definitions, Tour anchors, **radius 15** and
driving tuning are unchanged. Beacon Post and Redrock Depot occupy new southern space.

## Physical locations, itinerary and session identity

- `tour-layout.ts` owns a **five-site physical catalog**; `tour-outposts.ts` supplies
  Beacon/Depot definitions. Physical location ID, delivery occurrence index and legacy
  `destination.id` are **not interchangeable**.
- `tour-itinerary.ts` builds an immutable ten-occurrence plan from two shuffled bags of
  all five IDs: exactly two visits each, neither previous two destinations repeated next,
  and no repeated directed delivery pair among the nine transitions. Bounded enumeration
  produces **20 valid second bags per first permutation**, not an unbounded retry loop.
- Home/new Tour draws a fresh offer, not a guaranteed globally unique itinerary.
  Start/Restart uses that exact plan. `tourSeed` is honored only in DEV + test mode;
  production ignores prototype, test and seed overrides.
- `TourSession.destinations` has **ten occurrences**, unlike the five-site layout catalog.
  `plan`, `currentLocationId`, `completedLocationId`, `recordKey` and occurrence-bearing
  splits carry the distinction through integration. World location-ID wrappers are typed
  while preserving its physical numeric APIs; occurrence indices must not index the World catalog.
- A best belongs to the versioned layout/scoring/start/**ordered itinerary**, not the seed
  or a global three-stop score. The key is
  `tiny-planet-courier:tour:best:five-location-v2:score-v2:bay-entry:<ordered IDs>`.
  Old keys are retained and untouched. Prototype Tour `bestScoreKey` is `null`;
  results receive the actual session key. Storage failure remains nonfatal.

## Routes, recovery and completion

The authored directed graph retains **Bay → Station → Garden → Bay** and adds
**Station → Depot → Beacon → Station**. This graph describes authored navigation routes,
not an enforced traffic rule; free driving remains. Transit uses safe ground routes
(Bay coast, other inner paths), with no reverse Bay leap. The active destination remains
the compass target; roads provide route context and reverse-to-exit hints.

Entrance checkpoint earning resets for each leg. Only physically reached **grounded**
arrivals/transit earn recovery; an earlier visit cannot unlock a future transfer.
Delivery need not pass a mandatory entrance marker. Recovery preserves cargo, completed
occurrences, splits and active time, and World receives a defensive copy of the earned pose.
Handoffs never reset the van. Transfers count in the next split; pauses are excluded.
After ten handoffs, scoring freezes but driving continues. Restart resets the journey,
cargo, all reactions, navigation caches and earned checkpoints while retaining the offer.

## Runtime orchestration and camera

- `main.ts` owns renderer/scene setup, input/audio wiring, lifecycle, the fixed
  `1 / 120` simulation step, session/handoff integration and navigation caches.
- Presentation order stays **vehicle visual sync → world update → camera → render →
  target marker**, followed by scheduled HUD refresh/navigation presentation.
- `camera-rig.ts` owns `CameraRig` smoothing vectors, home/air blends, framing and FOV.
  `update(CameraFrame)` receives frame data, vehicle pose/state, viewport and cached
  welcome geometry—not the whole World or UI.
- `start(replay)` and `recovered()` retain distinct reset behavior. Home follows the
  existing mode-driven blend, not a new universal reset.

## Synchronous DEV bridge and test-driver boundary

`dev/test-bridge-types.ts` is the agreed shared TypeScript snapshot/route/control/fixture
contract; `Window.__planetTest` is optional. `tests/helpers/planet-test.ts` provides typed
consumers. Contract discipline does not imply runtime `Object.freeze` on the bridge.

`dev/test-bridge.ts` synchronously exports `installTestBridge`, with no top-level
installation side effect. Main calls it only under
`import.meta.env.DEV && parameters.has('test')`; there is no asynchronous import/ready race.
Its `observe()` callback reads current caches even after main replaces them. Snapshots
are passive defensive copies; gameplay navigation never reads a test snapshot.
Production contains no rendered DEV bridge modules or bridge markers, regardless of queries.

`setControls` drives the actual controller. Shared **test-only**
`tests/helpers/tour-browser-driver.ts` computes real controls on the page's `requestAnimationFrame`,
keeping heavy assertions outside the feedback loop. This repairs test input cadence, not
application physics, collision assertions or gameplay: there is no runtime autopilot.
Docking/navigation pose fixtures isolate UI/state and **do not prove route playability**.
The [checkpoint](iteration-plan.md#five-location-local-checkpoint--2026-09-11) separates
natural-start route proofs from fixture observations and documents host timing limits.

## World construction and reactions

`PlanetWorld` owns the driving environment, collider-array identity and append order,
seeded RNG consumption, construction order and the single static-batching pass. Existing
planet/road/locale/nature/target construction is extended with applicable outpost builders,
not duplicated whole worlds. Do not reorder construction or RNG calls as cosmetic cleanup.

- `world/scenery-primitives.ts` holds the shared palette, **single material cache**,
  alignment/mesh helpers and `LocaleSceneContext`.
- `world/locale-geometry.ts` provides explicit-root spherical overlays, local frames,
  arrows and optional canvas plaques from authored geometry.
- `buildBayScene`, `buildStationScene` and `buildGardenScene` take a level plus explicit
  `{ root, colliders, reducedMotion }` context, never the whole World. Builders return
  `{ reaction, dynamicRoots }`; Garden also returns `rotor`. World registers animated
  roots/ancestors before batching, retaining isolated animated materials and the collider array.
- `world/outpost-scene.ts` builds Beacon/Depot; `outpost-reaction.ts` owns their handoff
  reactions alongside `bay-reaction.ts`, Station and Garden controllers. Repeated deliveries
  reset/replay **only that physical site's reaction**. Full journey reset clears all sites.
  Existing numeric delivery methods and `DeliveryReactionSnapshot` remain compatible;
  Bay start/reset splash cleanup stays in the World wrapper.
- `vehicle.ts` carries **ten compact roof parcels**, consuming exactly one per occurrence
  and supplying its actual world-space handoff origin, including repeat visits.

Planet/nature/cloud/particle systems and batching policy are not redesigned.

### Measured physical extent and World-root cost

Primary-measured authored centerline sums: existing **158.124**, added **94.139**, of which
**80.954** is outside old footprints/corridors. Latitude extent grows from
**[-26.121, 40.244] to [-62.088, 40.244]**. Shared branches count in these sums: this is
**not unique paved area**, nor an increase to the global radius.

| World-root state | Objects | Meshes | Triangles (including instances) |
| --- | ---: | ---: | ---: |
| Initial | 537 | 258 | 113,103 |
| Splash-warmed | 557 | 278 | 113,343 |

There are **88 colliders**. After **80 deliveries/celebrations + 8 resets**, warmed counts
and object identities stayed stable. These measure the **World root**, not the complete
renderer/vehicle scene. Existing limits remain **360 meshes / 1,200 objects / 250,000 triangles**.

## UI and geometry

`UI` owns DOM insertion/caching, events, focus, state, results, toast lifetime, arrival
state, heading presentation and event-driven geometry invalidation. Cached geometry
read/write timing, reset behavior and marker-avoidance ordering remain significant.

- `ui/hints.ts` exports pure `missionHint` and `driveStateLabel`, consuming already-computed
  state; these do not select navigation, read DOM geometry or own hysteresis.
- `ui/template.ts` exports `renderUIShell` and `renderDeliveryQueue`; English copy,
  IDs, classes and data/ARIA contracts remain native HTML.
- `navigation-presentation.ts` remains the shared arrival/heading helper;
  `ui.ts` retains its public exports, including `BayHUDState`.
- Ten-split results use native details, **collapsed by default**, with bounded scrolling.
  Compact portrait/short-landscape forms preserve van, recipient and controls, with
  **12px result text and 44px interaction targets**. Native keyboard/touch scrolling is
  primary-verified in Chromium; this is not an actual Safari or hardware-phone claim.

## TypeScript and developer commands

`tsconfig.json` checks browser runtime source under `src`, excludes `src/**/*.test.ts`,
and includes `vite/client` types without Node globals. Strict mode stays enabled.
`tsconfig.check.json` extends it, overrides the exclusion with `exclude: []`, and checks
all `src`, `tests`, Vite/Vitest and Playwright configs with `vite/client` and Node types.
Thus `build`'s runtime check does not replace the all-project `typecheck`.

| Script (`npm run …`) | Purpose |
| --- | --- |
| `dev` / `preview` | Local Vite source / built-site server, bound to `127.0.0.1` |
| `format` / `format:check` | Biome formatting write / read-only check |
| `lint` / `typecheck` | Biome lint / all-project TypeScript check |
| `check` | Format check → lint → typecheck |
| `test` | Vitest unit suite (`npm test` is equivalent) |
| `test:bundle` | Node's test runner for the bundle-audit tests |
| `build` | Runtime TypeScript check → Vite production output in `dist/` |
| `check:bundle` | Audit existing `dist/`; does not build it |
| `verify` | `check` → Vitest → Node bundle tests → build → bundle audit |
| `test:browser` | DEV Playwright suite |
| `test:preview` | Build → production-preview suite; requires free port 4173 |

PR CI and Pages release both run **`npm run verify`** after `npm ci` on Node 24.
Browser suites remain separate sequential local checks: installed Edge by default,
`PLAYWRIGHT_CHANNEL=chrome` for installed Chrome. Publication requires successful
Actions and Pages status for the exact pushed SHA plus an independent public-site smoke;
local validation alone does not establish remote CI or deployment success.

Run `verify`, DEV groups, then production sequentially. Freeze source/build/worktrees during
browser checks; even temporary worktree creation/deletion can create filesystem events.
Check port ownership before stopping a server. Final production observations used an ignored
equivalent config on 4175, preserving the user's 4173 preview; see the
[reproduction notes](iteration-plan.md#reproduce-the-current-checkpoint).
Fresh-process grouping is **not a permanent fix for all Windows startup instability**.

## Production chunks and approved feature budgets

Vite 8/Rolldown `output.codeSplitting.groups` uses Windows-normalized module paths to
separate Three's `three.core.js` (`three-core`) and `three.module.js` (`three-renderer`)
from application code. The manifest records the dependency graph; Pages still uses
`/tiny-planet-courier/` (DEV `/`). No CDN or lazy-load UX changes are introduced.

Primary-measured production JavaScript for the current frozen candidate:

| Chunk | Raw bytes | gzip bytes (level 9) |
| --- | ---: | ---: |
| `index-wODMr3ZV.js` | 138,273 | 43,973 |
| `three-core-Y9dRlxmZ.js` | 217,287 | 58,893 |
| `three-renderer-Dre_LhAp.js` | 343,816 | 82,669 |
| **Total** | **699,376** | **185,535** |
| Released `d5a7985` total | 686,679 | 181,714 |

The owner explicitly approved **new-feature** `BUNDLE_BUDGETS` in `scripts/check-bundle.mjs`:
**each JS file strictly <500,000 raw bytes**, **total raw ≤715,000**, and
**summed per-file gzip(level 9) ≤190,000**. These supersede the original +2% total cap;
other audit checks remain intact. Every production JS file is audited; missing/empty output,
DEV markers, invalid manifest/emitted-file references and cyclic chunk graphs fail.
Do not silently raise thresholds to pass. Vite's printed gzip estimate is not this metric.

Totals increase approximately **1.85% raw / 2.10% gzip** versus `d5a7985` for new functionality:
**not a cold-byte reduction or measured startup-speed win**. Both engine hashes remain
unchanged. Cache stability depends on unchanged engine usage, not arbitrary future
application/dependency/toolchain changes. The earlier extraction's perturbation test and
measurements remain in the [historical engineering checkpoint](iteration-plan.md#engineering-release-checkpoint--2026-09-10).
