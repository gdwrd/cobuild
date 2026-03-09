# Plan: CLI UI enhancements

## Validation Commands
- `npm test`
- `npm run build`
- `npm run lint`
- `npm run typecheck`

### Task 1: Define the upgraded UI interaction model
- [x] Review the current shell, interview, startup, generation, and dormant execution screens to confirm the exact UX gaps this plan addresses.
- [x] Update `src/ui/types.ts` with any new shared state needed for scroll position, selection state, dismissible banners, and non-auto-exiting completion states.
- [x] Extend `docs/ui-architecture.md` to document the new screen behaviors, shared layout rules, and how the improved interaction model fits the existing `AppShell` and `ScreenController` layering.
- [x] Add or update type-focused tests in `src/ui/__tests__/types.test.ts` for any new shared UI contracts introduced in this task.

### Task 2: Refine the shared shell chrome and status hierarchy
- [x] Refactor `src/ui/AppShell.tsx` so persistent notices and transient errors stay visible even when the main screen content grows tall.
- [x] Rework the header layout to remain readable in narrower terminals while still showing session, stage, provider, model, and resumability context.
- [x] Normalize footer rendering so screen-specific key hints live in one place instead of being duplicated inside child components where possible.
- [x] Add or update `src/ui/__tests__/AppShell.test.tsx` coverage for the revised header, notice, error, and footer behavior.

### Task 3: Build a proper interview viewport and input experience
- [x] Refactor `src/ui/App.tsx` to separate transcript rendering from input editing so each concern can evolve without increasing component complexity.
- [x] Add a bounded transcript viewport with auto-follow behavior, explicit scrollback support, and stable rendering for long interviews.
- [x] Replace the current append-and-backspace-only input handling with an input component that supports cursor movement, basic editing keys, and clearer empty-state/help behavior.
- [x] Ensure transcript, prompt, thinking state, and footer remain usable together on smaller terminal sizes.
- [x] Expand `src/ui/__tests__/App.test.tsx` coverage for long transcripts, scrolling behavior, edited input submission, and command-entry edge cases.

### Task 4: Standardize interactive selection prompts
- [x] Upgrade `src/ui/ModelSelectPrompt.tsx` from a passive numbered list into a keyboard-driven picker with visible selection, current-model context, and Enter confirmation.
- [x] Refine `src/ui/YesNoPrompt.tsx` so it follows the same interaction conventions as the model picker and relies on shared shell hints instead of duplicating instructions unnecessarily.
- [x] Update `src/ui/RestoredSession.tsx` to present resume context and next action in the same visual language as the other interactive screens.
- [x] Add or extend tests in `src/ui/__tests__/ModelSelectPrompt.test.tsx`, `src/ui/__tests__/YesNoPrompt.test.tsx`, and `src/ui/__tests__/RestoredSession.test.tsx` to cover keyboard navigation and confirmation flows.

### Task 5: Improve startup and generation screen feedback
- [x] Enhance `src/ui/StartupScreen.tsx` to present provider readiness more clearly, including actionable detail when the active provider is unavailable but another provider is usable.
- [x] Refine `src/cli/app-shell.ts` startup progress labels and details so the UI can distinguish setup, provider health, and session resolution outcomes without ambiguity.
- [x] Rework `src/ui/GenerationScreen.tsx` so success does not auto-exit after a fixed timeout and instead shows a stable completion summary with generated artifact paths and the next expected action.
- [x] Improve generation failure and retry-exhausted states so they surface the failed stage and recovery path more clearly.
- [x] Expand `src/ui/__tests__/StartupScreen.test.tsx` and `src/ui/__tests__/GenerationScreen.test.tsx` for the new provider messaging, completion behavior, and retry/error flows.

### Task 6: Activate the execution-ready UI seam
- [x] Add reducer-driven execution state management to `src/ui/ScreenController.tsx` using `applyExecutionEvent` from `src/ui/types.ts`.
- [x] Replace the dormant `INITIAL_EXECUTION_STATE` render path with real `ExecutionConsole` wiring and user action handlers for continue, retry, and log inspection.
- [x] Reuse `FlowWrapper` for execution lifecycle phases so preflight, confirmation, running, validation, failure, and completion screens follow the same chrome conventions as the rest of the app.
- [x] Extend `src/ui/ExecutionConsole.tsx` as needed for scrollback, validation summaries, and action prompts that match the upgraded shell behavior.
- [x] Add or update tests in `src/ui/__tests__/ExecutionConsole.test.tsx`, `src/ui/__tests__/FlowWrapper.test.tsx`, and `src/ui/__tests__/ScreenController.test.tsx` to cover the live execution flow.

### Task 7: Update documentation and final verification
- [x] Update `README.md` so the documented CLI layout, prompt behavior, startup diagnostics, generation completion flow, and execution capabilities match the implemented UI.
- [x] Review UI-related test fixtures and helper utilities for duplication created during the refactor and consolidate them where it improves maintainability.
- [x] Run `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck`, then address any regressions introduced by the UI changes.
- [x] Confirm the final plan leaves the CLI in a coherent state for both fresh sessions and resumed sessions before marking the work complete.
