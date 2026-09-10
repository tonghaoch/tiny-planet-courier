# Architecture and development checks

This describes the current architecture and development checks.
See the [engineering release checkpoint](iteration-plan.md#engineering-release-checkpoint--2026-09-10) for coordinator-verified pre-release local validation and limitations.

## Scope and public boundaries

The game remains **vanilla TypeScript + Three.js + Vite**, with native HTML/CSS UI.
This is a bounded responsibility extraction, not a React, ECS or container rewrite.
There is no global directory migration: `src/main.ts`, `src/world.ts`, `src/ui.ts`
and existing level/session/test import paths remain the public entry points.
Driving physics, route identities, handoff timing, recovery and the accepted HUD remain unchanged.

## Runtime orchestration and camera

- `main.ts` owns renderer/scene setup, input and audio wiring, lifecycle actions,
  the fixed `1 / 120` simulation step, session/handoff integration and navigation caches.
- The presentation order remains **vehicle visual sync → world update → camera →
  render → target marker**, followed by scheduled HUD refresh/navigation presentation.
- `camera-rig.ts` owns `CameraRig` smoothing vectors, home/air blends, framing and FOV.
  `update(CameraFrame)` receives only frame data, vehicle pose/state, viewport and cached
  welcome geometry—not the whole World or UI.
- `start(replay)` and `recovered()` retain distinct reset behavior. Returning home
  still follows the existing mode-driven blend rather than a new universal reset.
- `TourSession` owns delivery order, splits and earned-checkpoint policy; World
  receives a defensive copy of the chosen recovery pose. Handoffs do not reset driving.
- The compass uses the active destination bearing. Road caches provide route hints
  and reverse-to-exit context, not a replacement compass target.

## Synchronous DEV bridge

`dev/test-bridge-types.ts` is the frozen shared TypeScript contract for snapshots,
routes, controls and navigation fixtures; `Window.__planetTest` is optional.
“Frozen” means the agreed interface is preserved, not that the runtime bridge uses `Object.freeze`.
`tests/helpers/planet-test.ts` provides typed browser consumers.

`dev/test-bridge.ts` exports a synchronous `installTestBridge` with no top-level
installation side effect. Main calls it only under
`import.meta.env.DEV && parameters.has('test')`; there is no asynchronous import/ready race.
Its `observe()` callback reads current navigation/route caches even when main replaces them.
Snapshots preserve defensive-copy and passive-observation behavior; gameplay navigation
is still computed by main, not by reading a test snapshot.

`setControls` drives the actual controller. Docking/navigation pose fixtures isolate
UI and state checks; **teleport fixtures are not route-playability evidence**.
Production ignores prototype selectors and contains no rendered DEV bridge modules
or bridge markers, even when the URL includes `?test=1`.

## World construction and reactions

`PlanetWorld` owns the driving environment, collider-array identity and append order,
seeded RNG consumption, construction order and the single static-batching pass.
The order remains planet → roads → Tour connectors → settlements → Bay → Station →
Garden → nature → clouds → targets → atmosphere → optional Tour fill → batching.
Only the applicable locale builders run; builders do not introduce locale wrapper groups.

- `world/scenery-primitives.ts` holds the shared palette, **single material cache**,
  alignment/mesh helpers and `LocaleSceneContext`.
- `world/locale-geometry.ts` provides explicit-root spherical overlays, local frames,
  arrows and optional canvas plaques, using the existing authored level geometry.
- `buildBayScene`, `buildStationScene` and `buildGardenScene` take a level plus explicit
  `{ root, colliders, reducedMotion }` context, never the whole World.
- Builders return `{ reaction, dynamicRoots }`; Garden also returns `rotor`.
  World registers these before batching, including Garden flowers and animated ancestors.
  Animated materials remain isolated; the environment keeps the same collider array.
- `bay-reaction.ts` owns `BayDeliveryReaction`, separate from construction, alongside
  the existing Station/Garden reaction controllers. World's public delivery methods
  and `DeliveryReactionSnapshot` remain compatible; Bay start/reset splash cleanup
  stays in the World wrapper.

Planet/nature/cloud/particle systems and batching policy are not redesigned.
Do not reorder construction or random calls as cosmetic cleanup.

## UI and geometry

`UI` still owns DOM insertion/caching, events, focus, state, results, toast lifetime,
arrival state, heading presentation and event-driven geometry invalidation.
Its cached geometry reads/writes and marker-avoidance ordering are preserved.

- `ui/hints.ts` exports pure `missionHint` and `driveStateLabel` functions. They consume
  already-computed state; they do not select navigation, read DOM geometry or own hysteresis.
- `ui/template.ts` exports `renderUIShell` and `renderDeliveryQueue`, preserving English
  copy, IDs, classes, data/ARIA attributes and DOM hierarchy.
- `navigation-presentation.ts` remains the shared arrival/heading helper;
  `ui.ts` retains its public exports, including `BayHUDState`.

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
| `test:preview` | Build → production-preview Playwright suite |

The PR CI and Pages release workflows both call **`npm run verify`** after `npm ci`
on Node 24. Consult Actions for the exact release SHA's workflow and Pages deployment
status; a push alone does not confirm publication. Browser suites
remain separate, sequential local checks, using installed Edge by default or
`PLAYWRIGHT_CHANNEL=chrome` for installed Chrome.

Run `verify`, then `test:browser`, then `test:preview` sequentially. Keep DEV browser
sessions exclusive: no source edits, builds, or worktree creation/deletion during a run.
Even read-only analysis that creates temporary worktrees can generate filesystem events.
Check port ownership before stopping a server. This isolation rule is not a claim that
all Windows reload/flakiness causes have been proved or permanently fixed.

## Production chunks and fixed budgets

Vite 8/Rolldown `output.codeSplitting.groups` uses Windows-normalized module paths to
separate Three's `three.core.js` (`three-core`) and `three.module.js` (`three-renderer`)
from application code. The manifest records the dependency graph; the Pages base remains
`/tiny-planet-courier/` (DEV uses `/`). No CDN or lazy-load UX changes are introduced.

Coordinator-measured production JavaScript bytes on 2026-09-10:

| Chunk | Raw bytes | gzip bytes (level 9) |
| --- | ---: | ---: |
| App | 125,576 | 40,152 |
| Three core | 217,287 | 58,893 |
| Three renderer | 343,816 | 82,669 |
| **Total** | **686,679** | **181,714** |
| Original `590c329` total | 684,308 | 179,766 |

`BUNDLE_BUDGETS` in `scripts/check-bundle.mjs` fixes **each JS file <500,000 raw bytes**,
**total raw ≤697,994**, and **summed per-file gzip(level 9) ≤183,361**. It audits every
production JS file, rejects missing/empty output and bridge markers, and validates
manifest references/emitted files and an acyclic chunk graph. Do not raise thresholds
just to pass; Vite's printed gzip estimate is not the budget metric.

Cold totals grow **0.346% raw / 1.084% gzip**: this is **not a cold-byte reduction or a
measured startup-speed improvement**. A coordinator memory-only business perturbation
changed the app hash while both engine chunks retained identical hashes/bytes; engine
chunks contained no app modules. Cache stability is conditional on **unchanged engine
usage**, not guaranteed for arbitrary application/dependency/toolchain changes.
