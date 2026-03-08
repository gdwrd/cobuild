# Plan: CLI UI foundation and execution-ready shell

## Validation Commands
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run typecheck`

### Task 1: Define the UI state model and future execution boundaries
- [x] Introduce explicit UI view/state types that separate interview, startup, restore, decision, artifact generation, and future task execution concerns instead of letting `ScreenController` own all transitions ad hoc.
- [x] Add a small shared UI state contract for status header data, footer help data, stage progress data, notices, and errors so current screens can be upgraded without coupling presentation to provider or generator internals.
- [x] Define an execution-oriented state shape that can later represent `ralphex` plan runs, streamed terminal output, current task metadata, validation command progress, and wrapper states such as paused, failed, and awaiting confirmation.
- [x] Document the intended layering in code comments or a short developer note so future `ralphex` execution work extends the same shell instead of introducing a second UI architecture.

### Task 2: Refactor screen orchestration into a shell plus focused views
- [x] Split `ScreenController` responsibilities into a reusable app shell component and smaller screen/view components for startup, interview, generation, decisions, and restored-session flows.
- [x] Move shared chrome such as headers, notices, status summaries, and help text out of individual screens so new flows can inherit a consistent layout.
- [x] Ensure the shell accepts screen-specific content via typed props so a future execution screen can mount inside the same frame without special-case rendering paths.
- [x] Update tests to cover the refactored screen routing and verify that existing interview and generation flows still render the correct views.

### Task 3: Implement a richer persistent status header and footer
- [x] Replace the minimal interview status bar with a persistent header that shows session id, current stage, active provider, active model when relevant, provider readiness, and resumability context.
- [x] Add a footer/help area that shows available commands and keybindings per screen instead of a hard-coded interview-only slash command list.
- [x] Make provider readiness visible at all times when degraded, including startup notices, unavailable-provider states, and any retry-exhausted path.
- [x] Design the header/footer API so a future execution mode can swap in task progress, validation status, and terminal controls without changing the shell contract.

### Task 4: Upgrade the interview transcript and command experience
- [x] Redesign the transcript view to better separate assistant and user turns, wrap long content cleanly, and keep input, notices, and transcript history visually distinct.
- [x] Add explicit handling for unknown slash commands and introduce a `/help` or equivalent inline command discovery path so command usage is visible without leaving the interview flow.
- [x] Replace the current plain-text model selection transcript dump with a dedicated selection experience or an equivalent focused prompt component.
- [x] Add or update UI tests for transcript rendering, command help, unknown command feedback, and model-selection interaction states.

### Task 5: Improve startup and restored-session visibility
- [x] Replace the static startup message with a staged startup screen that reflects bootstrap, TTY validation, provider readiness checks, and session resolution progress.
- [x] Expand the restored-session screen to show session stage, provider, model where applicable, progress for resumable work, and the most relevant next action.
- [x] Preserve current startup semantics while making it obvious when the app is blocked only by provider readiness versus when it is fully broken.
- [x] Add tests for the new startup and restored-session states, including degraded provider readiness and resumed dev-plan progress.

### Task 6: Redesign generation UI as a workflow stepper
- [x] Replace the current generation screen with a stepper-style workflow summary that shows completed, active, pending, and intentionally skipped stages.
- [x] Surface artifact file paths, phase counts, retry state, and stop reasons in a structured layout instead of only appending plain success lines.
- [x] Ensure the generation view can later host an execution stage after plan creation without another one-off screen transition model.
- [x] Add tests for spec-only, architecture, plan, dev-plan, terminated-early, and retry-exhausted presentation states under the new layout.

### Task 7: Introduce an execution console abstraction without enabling ralphex runs yet
- [x] Define a terminal/output pane component contract that can render streamed lines, status events, and summary metadata from a long-running subprocess without assuming `ralphex` specifically.
- [x] Add a controller-facing event model for execution output, task boundaries, validation command progress, and user-facing wrapper actions such as retry, continue, or inspect logs.
- [x] Keep the implementation dormant or backed by fixtures for now, but wire it into the shell architecture so a future `ralphex` execution screen can be added by plugging in a real runner.
- [x] Add tests around the execution console state reducer or presenter so future subprocess work lands on a stable UI contract.

### Task 8: Add future-ready wrappers for long-running execution flows
- [x] Define wrapper UI patterns for preflight checks, execution start confirmation, live run state, validation in progress, failure summary, and completion summary so current generation UX and future execution UX feel related.
- [x] Ensure wrapper patterns support both non-interactive generation flows and interactive execution flows that may need user acknowledgement before or after a task.
- [x] Capture the minimal metadata required for future `ralphex` wrapping, including current plan file, current task label, validation command being run, and exit status summaries.
- [x] Verify these wrappers do not regress current generation flow copy or keyboard behavior.

### Task 9: Refresh CLI help, docs, and developer guidance for the new UI model
- [x] Update CLI help text and `README.md` to describe the richer UI states, improved command discovery, and provider/status visibility users should expect.
- [x] Add a short developer-oriented note describing the shell architecture and the intentional execution-ready seam for future `ralphex` integration.
- [x] Document any new slash commands, keybindings, or screen-specific controls introduced by the UI redesign.
- [x] Review existing tests and docs for outdated screenshots, copy, or assumptions about the old single-screen interview UI.

### Task 10: Run verification and manual UX review across current workflows
- [x] Run build, lint, typecheck, and test validation after the UI refactor is complete.
- [x] Manually verify startup, resumed interview, provider-unavailable handling, model selection, yes/no decisions, generation success, generation failure, and retry-exhausted flows in a real terminal.
- [x] Confirm the refactored shell can accommodate a placeholder execution console without disrupting current artifact-generation behavior.
- [x] Record any follow-up gaps that should become the next plan for actual `ralphex` phase execution and terminal streaming work.
