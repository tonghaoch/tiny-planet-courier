# Agent collaboration policy

## Roles

### Primary agent — plan, coordinate, verify

- Own requirements, product and architecture decisions, implementation plans, task boundaries, interface agreements, and acceptance criteria.
- Delegate application code, permanent test code, refactors, and implementation-related documentation to implementation subagents. Do not quietly take over implementation, even for a small fix.
- The primary agent may author plans and collaboration/governance documents, mechanically integrate reviewed subagent changes, perform authorized Git operations, and run independent checks or temporary inspection scripts.
- Review the actual integrated diff and verify behavior. A subagent saying "tests pass" is not a substitute for coordinator verification.

### Implementation subagents — implement the assigned scope

- Implement the assigned code and tests directly, following the approved plan and explicit file ownership.
- Do not recursively delegate your assignment, redesign the overall task, or modify another worker's files without coordination.
- Return the changed files, interface changes, validation commands/results, and any remaining limitations. Distinguish tests that ran from tests that were not run.
- If the assignment cannot be completed within its constraints, report the blocker rather than silently changing the scope.

## Required model and effort

- Implementation subagents must use **GPT-6 with `medium` reasoning effort** (`mid` is the user's informal name for `medium`).
- The currently verified model selector in this environment is **`gpt-6-astra[1m]`**; the provider response identifies it as `gpt-6-astra`.
- Set the model and effort explicitly in the orchestration tool or equivalent runtime configuration. A sentence in the prompt claiming to use that configuration is not sufficient.
- Do not inherit the primary agent's higher effort by accident, change the user's global defaults, or silently substitute another model family or effort level.
- If the requested configuration cannot be selected, stop and tell the user. Do not use an automatic fallback. Verify runtime model metadata where available and report configuration accurately.

## Development and repair loop

1. The primary agent inspects the current state, reads the relevant plans, and agrees on the approach before nontrivial implementation.
2. Assign bounded implementation tasks, including owned files, shared interfaces, behavior to preserve, and acceptance tests. Implement shared contracts before dependent work.
3. Parallelize only when ownership and dependencies make it safe. Use isolation when concurrent edits would otherwise conflict.
4. The primary agent reviews the integrated result and runs the necessary tests, builds, and browser checks.
5. When verification reveals a problem, the primary agent supplies a reproduction, expected behavior, and constraints to an implementation subagent using the same required model/effort. The subagent repairs it; the primary agent verifies again.
6. Update the handoff/iteration status with observed results, not assumptions or unverified claims of completion.

## Project safeguards

- Preserve the accepted driving baseline and the distinct route identities described in [the iteration plan](docs/iteration-plan.md). Add experiences deliberately; do not stack unrelated features.
- Keep the game and maintained user-facing documentation in English.
- Run development-browser tests and production-preview tests sequentially. They can share output locations, and builds/workspace changes can trigger Vite reloads. Check preview-port ownership before stopping any process.
- Use real controller inputs to validate route playability; teleport helpers may isolate UI/state tests but do not prove a route can be driven.
- Keep temporary screenshots, test outputs, dependencies, and agent worktrees out of commits.
- Do not commit, push, merge, or deploy without the user's explicit request. A development task does not itself authorize replacing the live game.

## Instruction discovery

`AGENTS.md` is the canonical collaboration policy. `CLAUDE.md` points here so Claude Code sessions discover it automatically; do not maintain a second copy of these rules.
