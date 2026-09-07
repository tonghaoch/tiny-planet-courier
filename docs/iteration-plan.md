# Bay Leap Delivery — iteration plan and handoff

## Current checkpoint

- **Branch:** `prototype/bay-leap`
- **Status:** Playable vertical slice; waiting for the owner's hands-on feedback before expansion.
- **Scope:** One parcel, two routes, one memorable delivery. The original three-stop game remains available.

The prototype was initially kept uncommitted for local playtesting. It is now being committed and pushed at the owner's request so development can continue on another computer. **This is a branch checkpoint, not approval to merge into `main` or replace the live GitHub Pages game.**

## Continue on another computer

Use Node.js 24, then:

```sh
git clone --branch prototype/bay-leap https://github.com/tonghaoch/tiny-planet-courier.git
cd tiny-planet-courier
npm ci
npm run dev
```

- **Bay prototype:** http://127.0.0.1:5173/?prototype=bay
- **Original game for comparison:** http://127.0.0.1:5173/
- **Existing public game:** https://tonghaoch.github.io/tiny-planet-courier/

If the repository is already cloned, start with a clean working tree, run `git fetch origin`, and check out `prototype/bay-leap`. If no local copy of that branch exists yet, use `git switch --track origin/prototype/bay-leap`.

The prototype selector is gated by `import.meta.env.DEV`. **`npm run preview` and production builds intentionally show the original game, even if `?prototype=bay` is present.** Use the development server to play this slice.

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

- One parcel to **Sunrise Bakery**, not a larger mission system.
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

## Where to work

| Area | Files | Responsibility |
| --- | --- | --- |
| Authored course | `src/bay-level.ts` | `BAY_LEVEL`, coordinates, route outlines, water polygon, ramp support and lip crossing |
| Driving feel | `src/bay-driving.ts` | `BAY_DRIVING_TUNING`, grounded/airborne/recovering states, flight prediction, contact and recovery |
| Shared interfaces | `src/bay-types.ts` | Surface samples, poses, ramp crossings, drive events, and landing predictions |
| World and bakery | `src/world.ts` | Spherical overlays, scenery clearance, static batching, dynamic bakery reaction and splash pool |
| Vehicle presentation | `src/vehicle.ts` | Shared van model, prototype controller adapter, suspension/cargo feedback, landing guide and shadow |
| Integration and camera | `src/main.ts` | DEV selector, fixed-step update, events, camera, non-blocking delivery and local test bridge |
| Session and UI | `src/game.ts`, `src/ui.ts`, `src/style.css` | Completion policy, separate records, feedback, progress and compact result card |
| Sound | `src/audio.ts` | Optional driving/impact audio, mute, pause and lifecycle cleanup |
| Route validation | `src/bay-route.test.ts`, `tests/helpers/bay-pilot.ts`, `tests/browser/bay.spec.ts` | Real-controller route completion and browser interaction checks |

Keep geometry and physics in agreement. If changing ramp length/rise, shore positions, or landing dimensions, update the shared level data and recheck actual flight ranges. Do not create a visual-only ramp or a hidden support surface across the water.

## Validation at handoff

Last verified during this implementation session:

- **84 unit tests passed.**
- **10 browser tests passed.**
- TypeScript checks and the production build passed.
- Both routes were completed by steering the actual controller, not by teleporting to the destination.
- Launch entry speeds of **6.2, 6.8, and 7.8** were checked against the real authored level and landed across the bay; an unboosted approach was checked to splash and recover.
- Browser coverage includes keyboard launch after enabling sound, landing-guide visibility, recovery, paused bakery animation, continued driving after delivery, and narrow-screen touch/retry behavior.
- Production preview was checked with the prototype/test query parameters: it still showed the original three deliveries and did not expose the test bridge.

Automated driving took roughly **9 seconds on the coast route and 4–5 seconds via the leap** in the recorded browser checks. These are technical smoke-test observations, **not human playtest results or proof that the game is fun**.

```sh
npm test
npm run build
npm run test:browser
```

Browser tests currently target a locally installed **Microsoft Edge**. On a machine without Edge, install the appropriate browser or adapt `playwright.config.ts`; playing the game itself only needs a modern WebGL 2 browser. Do not change gameplay merely to accommodate a missing browser installation.

Generated screenshots and test diagnostics go into ignored `artifacts/` and `test-results/` directories. Vite reports a non-blocking bundle-size warning; do not turn this playtest into an unrelated bundling rewrite unless measured loading problems justify it.

## Next iteration: wait for hands-on feedback

### 1. Play the existing slice before adding anything

- [ ] Drive the coast road first, paying attention to turn-in, coasting, and braking.
- [ ] Try the jump with sound enabled. Is the ramp readable? Can you see where the van will land?
- [ ] Deliberately undershoot. Does the recovery invite an immediate retry, or feel irritating?
- [ ] Deliver and watch the bakery. Is the reaction noticeable and satisfying without a cutscene?
- [ ] Compare with the original local game, including touch controls if relevant.

Ask for three specific reactions:

1. **Does steering feel comfortable and predictable?**
2. **Does the leap feel readable and controllable?**
3. **After landing or failing, do you want to try it again?**

### 2. Tune the weakest link, not the feature count

- If steering feels floaty or twitchy, tune steering response, yaw rate, coasting and braking first.
- If a jump feels arbitrary, inspect approach readability, launch speed/alignment, the landing guide and camera before adding more air controls.
- If delivery feels flat, improve the timing, framing, sound and bakery reaction before adding rewards or progression.
- If retries drag, adjust recovery/reset timing instead of creating a new menu or retry currency.

Make a small change, replay both routes, and preserve the regression tests. Do not assume more realistic physics or stronger camera shake is an improvement.

### 3. Expand only after the slice earns it

- [ ] Obtain the owner's confirmation that this loop is enjoyable.
- [ ] Then carry the proven driving and feedback quality to the other destinations, with route differences that create meaningful choices.
- [ ] Decide explicitly how the prototype becomes the production game; remove or promote the DEV-only gate deliberately.
- [ ] Merge/deploy to `main` only when the owner approves that release step. The current push is for cross-computer continuation, not a production rollout.
