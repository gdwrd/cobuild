# Plan: Provider-aware header state, global settings defaults, and branded interview logo

## Validation Commands
- `npm run build`
- `npm test`
- `npm run lint`
- `npm run typecheck`

### Task 1: Reproduce and pin down provider/model header behavior
- [x] Trace the active provider and model state flow through `src/ui/ScreenController.tsx`, `src/interview/provider-command.ts`, `src/providers/factory.ts`, and `src/ui/AppShell.tsx` to document exactly when a stale Ollama model survives a switch to `codex-cli`.
- [x] Add or update focused tests in `src/ui/__tests__/ScreenController.test.tsx` and `src/ui/__tests__/AppShell.test.tsx` that reproduce the current bug: switching or resuming a `codex-cli` session must not render an Ollama model name in the header.
- [x] Define the invariant for display state: only show a model in the shell when the active provider supports an in-app model concept, and ensure the tests fail before the implementation change.

### Task 2: Fix provider-specific model state and session updates
- [x] Update provider switching logic so moving to `codex-cli` clears or ignores any Ollama-only UI model state instead of carrying `currentModel` forward into the header.
- [x] Decide and implement the session-level rule for `model` when `provider === 'codex-cli'`: either persist it as `undefined` on switch or treat it as provider-scoped data that is hidden and never reused outside Ollama.
- [x] Tighten `StatusHeaderData` production and `AppShell` rendering so `codex-cli` never displays `/model`, while Ollama still shows the resolved model and unavailable-provider indicators correctly.
- [x] Extend resume-path coverage so restored `codex-cli` sessions, mid-interview provider switches, and dev-plan resumes all honor the same provider-aware model display rules.

### Task 3: Introduce persistent global settings for default provider and Ollama model
- [x] Add a new persisted settings module under `src/` for reading and writing a global config file in `~/.cobuild/`, with atomic writes, migration-friendly defaults, and repo-consistent logging/error handling.
- [x] Define a small settings schema that stores default provider and default Ollama model, plus clear rules for invalid or partial data so legacy installs continue to work without manual migration.
- [x] Extend startup/bootstrap so the settings file location is created alongside existing `~/.cobuild/` state, and load global settings before new-session provider/model resolution begins.
- [x] Add unit tests for settings persistence, invalid file recovery, default value behavior, and path handling using the same temp-home patterns already used for session/bootstrap tests.

### Task 4: Wire global settings into new-session startup and provider/model workflows
- [x] Update CLI startup/config resolution so a new session uses global defaults when present, while an explicitly passed `--provider` flag still wins and resumed sessions still use their saved session provider.
- [x] Extend Ollama model bootstrap so a new Ollama session prefers the globally configured default model before falling back to first-installed-model resolution, while still handling missing-model and zero-model cases gracefully.
- [x] Decide how users set and update global defaults from the existing interaction model, then implement the minimum coherent workflow in slash commands and/or startup behavior without breaking current `/model` and `/provider` semantics.
- [x] Add tests in CLI, provider, interview-command, and ScreenController suites that cover new sessions with saved defaults, explicit CLI overrides, missing configured models, and `codex-cli` defaults with no model shown in UI.

### Task 5: Add branded ASCII logo support to the interview screen
- [x] Design a large ASCII `cobuild` logo with a tool/wrench motif that fits typical terminal widths, remains readable in plain text, and preserves the repo’s current Ink rendering style.
- [x] Introduce a dedicated interview-logo component in `src/ui/` so the art is isolated from interview transcript/input logic and can be tested independently.
- [x] Mount the logo above the main interview UI only, keeping startup, restore, yes/no, generation, and error screens unchanged unless the final design requires a shared header treatment.
- [x] Verify the logo layout works with the persistent shell chrome, long transcripts, model selection mode, and narrow-terminal rendering without pushing critical input content off screen.

### Task 6: Cover branding behavior with UI tests
- [x] Add or update UI tests that assert the logo appears on the main interview screen and does not appear on unrelated screens such as generation, restore, or fatal error views.
- [x] Add snapshot-style or text-output assertions that lock in the chosen ASCII art enough to catch accidental regressions while still allowing intentional branding edits.
- [x] Ensure the new logo component does not break existing transcript/input rendering tests, especially those that depend on visible interview content order.

### Task 7: Update documentation and operational notes
- [x] Update `README.md` to document global settings behavior, the precedence order between CLI flags, global defaults, and resumed sessions, and the provider-specific model display rules.
- [x] Document any new settings file path and schema in `README.md` and `CLAUDE.md`, including how default provider/model values affect new sessions.
- [x] Refresh any UI or usage docs that describe the interview screen so they mention the branded ASCII logo and keep screenshots/examples textually accurate.

### Task 8: Run end-to-end verification across the three requested changes
- [x] Run `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck` after implementation and fix any regressions introduced by the settings and UI changes.
- [x] Manually verify three interactive flows in a real TTY: switching from Ollama to `codex-cli` with no stale model in the header, starting a fresh session that picks up saved global defaults, and rendering the new interview logo without input/layout issues.
- [x] Confirm that resumed sessions still override global defaults, `codex-cli` sessions never expose an Ollama model name, and Ollama sessions still recover cleanly when the configured default model is unavailable.
