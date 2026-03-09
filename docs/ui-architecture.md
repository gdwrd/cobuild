# UI Architecture — Shell Design and Execution-Ready Seam

## Overview

The `cobuild` terminal UI is built on [Ink](https://github.com/vadimdemedes/ink) (React for CLIs). It uses a layered shell architecture where every screen is mounted inside a shared wrapper (`AppShell`) that provides consistent chrome, and screen-specific views are small focused components that render as children.

## Layer Model

```
ScreenController (screen state, async logic, event wiring)
  └── AppShell (status bar, notice, transient error, footer)
        └── <focused screen component> (StartupScreen | ErrorScreen | RestoredSession |
                                         App | GenerationScreen | YesNoPrompt |
                                         ExecutionConsole)
```

**ScreenController** owns all top-level state and wires async operations (startup, interview loop, artifact pipeline, dev-plan loop) to UI state via React hooks. It manages screen transitions via a `screen` state field typed as `Screen` (defined in `src/ui/types.ts`).

**AppShell** owns no business logic. It receives typed props (`StatusHeaderData`, `FooterHelpData`, notice, transient error) and renders shared chrome around its `children`. Adding a new screen does not require changes to AppShell — just mount the new component as children.

**Focused screen components** handle only their own presentation. They receive exactly what they need via props and do not reach into global state.

## Shared Type Contracts

All cross-component UI state contracts live in `src/ui/types.ts`:

- `Screen` — the exhaustive union of all valid screen names
- `SessionStage` — the session stage lifecycle (`interview` → `spec` → `architecture` → `plan` → `dev-plans`)
- `StatusHeaderData` — props for the persistent status bar (session ID, stage, provider, model, provider readiness, optional resumability context)
- `FooterHelpData` — commands and keybindings arrays for the per-screen footer
- `SharedUIState` — a combined shape for all shared chrome data
- `ScrollState`, `INITIAL_SCROLL_STATE` — viewport scroll position for bounded content areas (transcript, output log); supports auto-follow and explicit scrollback
- `SelectionState` — keyboard-driven picker cursor state shared by ModelSelectPrompt and any future selection UI
- `BannerData` — dismissible notice banner with id, message, level, and dismissible flag so ScreenController can track which banners the user has cleared
- `CompletionState` — non-auto-exiting terminal state for completed flows (generation, execution), including summary text, artifact paths, and next-action hint
- `ExecutionState`, `ExecutionEvent`, `applyExecutionEvent` — the execution console state model and event reducer
- `FlowLifecyclePhase`, `RalphexRunMetadata`, `FlowWrapperState` — lifecycle wrapper types used by `FlowWrapper`

## Improved Interaction Model

### Scroll state (transcript and output viewports)

Long content areas (interview transcript, execution output) use `ScrollState` to bound their
viewport height and track position. The rule is:

- `autoFollow: true` — viewport follows new content; user sees the latest output automatically.
- `autoFollow: false` — user has scrolled back; viewport stays at `scrollbackLines` from the
  bottom. A "[scrolled — press End to follow]" indicator should be shown so the user knows they
  are not at the tail.
- The viewport transitions back to `autoFollow: true` when the user presses End / G, or when
  new content arrives while the user is already at the bottom.

Screen components that own a scrollable area keep `ScrollState` in local `useState`. They do not
expose scroll state up to ScreenController; it is purely local rendering state.

### Selection state (keyboard-driven pickers)

`SelectionState` tracks the currently highlighted item in a picker (e.g. ModelSelectPrompt).
Screens that render a picker initialise `SelectionState` locally and update it on arrow key
presses. The picker highlights the selected row, shows the current model as context, and confirms
on Enter. This avoids requiring the user to type numbers or model names.

### Dismissible banners

`BannerData` extends the existing notice system with an `id` and a `dismissible` flag.
ScreenController maintains a `Set<string>` of dismissed banner IDs so that cleared notices do not
re-appear when the user navigates back to a screen. Non-dismissible banners (e.g. provider
unavailable) persist until the underlying condition changes.

The AppShell `notice` prop continues to accept a plain string for backwards compatibility.
Future callers should prefer passing a `BannerData` via a `banner` prop so the dismissible
behaviour is available. The AppShell renders dismissal hints in the footer area rather than
inline in the banner, following the same convention as other keybindings.

### Non-auto-exiting completion

`CompletionState` replaces the fixed 1500 ms auto-exit on generation success.
When a flow completes, ScreenController populates a `CompletionState` object and the screen
renders a stable completion view:

- A summary line (e.g. "All artifacts generated.")
- Each artifact path on its own line, formatted for easy copying
- A next-action hint (e.g. "Review docs/plans/ then run cobuild to continue")
- Footer updated to show only "ctrl+c: quit"

The screen stays visible until the user presses ctrl+c. This ensures users on slow terminals or
after a context switch can still see what was generated.

### Footer conventions

Each screen supplies its own `FooterHelpData`. Key hints that are already surfaced by the shared
footer **must not** be duplicated inside the screen component. Specifically:

- `ctrl+c: quit` is always present in the footer; screens must not echo it inline.
- `y/n  ←/→ select  Enter confirm` belongs in `YesNoPrompt`'s `FooterHelpData`, not in
  component JSX.
- `Enter to continue` belongs in `RestoredSession`'s `FooterHelpData`, not in component JSX.

This makes it easy to update keybindings in one place.

## Execution-Ready Seam

The shell is designed so that a future `ralphex` execution screen can be added without structural changes:

1. `Screen` already includes `'execution'` as a valid value.
2. `ScreenController` has a dormant `screen === 'execution'` branch that renders `ExecutionConsole` with the initial empty state.
3. `ExecutionState` and `applyExecutionEvent` define the full event model for subprocess output, task boundaries, validation command progress, and user actions (retry / continue / inspect-logs). These are independently tested and ready to be driven by a real runner.
4. `FlowWrapper` and `FlowLifecyclePhase` define wrapper chrome for preflight, start-confirmation, running, validating, failure, and completion phases — shared between the current generation flow and any future execution flow.
5. `AppShell` accepts `statusBar.resumabilityContext` as a free-text slot. Currently used for "resumed from dev-plans"; future execution mode can populate it with task progress (e.g. "phase 3/5, task 2").

To wire in a real `ralphex` runner:

1. Add `executionState: ExecutionState` to `ScreenController` state, driven by `applyExecutionEvent` via `useReducer`.
2. Transition `screen` to `'execution'` when a plan run starts.
3. Implement `onUserAction: (action: ExecutionUserAction) => void` and pass it to `ExecutionConsole`.
4. Dispatch `ExecutionEvent` values from the runner as output lines, task boundaries, and validation results arrive.

No changes to `AppShell`, `StartupScreen`, `GenerationScreen`, or the interview flow are required.

## Screen Footers

Each screen has its own `FooterHelpData` constant defined at the top of `ScreenController.tsx`:

| Constant | Screen | Commands | Keybindings |
| --- | --- | --- | --- |
| `INTERVIEW_FOOTER` | Interview (`main`) | `/finish-now /model /provider /help` | `ctrl+c: quit` |
| `RESTORED_FOOTER` | Restored session | — | `enter: continue  ctrl+c: quit` |
| `YESNO_FOOTER` | Decision prompts (`yesno`) | — | `y: yes  n: no  ctrl+c: quit` |
| `GENERATING_FOOTER` | Generation stepper | — | `ctrl+c: quit` |
| `EXECUTION_FOOTER` | Execution console | — | `r: retry  l: inspect logs  y: continue  ctrl+c: quit` |

To add controls for a new screen, define a new `FooterHelpData` constant and pass it to `AppShell` in the corresponding render branch.

## Generation Stepper

`GenerationScreen` renders a four-stage workflow stepper (`spec` → `architecture` → `plan` → `dev-plan`). Each stage shows one of:

- Completed — label, file path
- Active — spinner and current progress (e.g. "phase 2/5")
- Pending — dimmed label
- Skipped — marked as not generated

To add an `execution` stage after `dev-plan`, add `'execution'` to the `WORKFLOW_STAGES` array in `GenerationScreen.tsx` and define its display logic. No other files need to change.

## Testing Conventions

- Each UI component has a test file in `src/ui/__tests__/`.
- Tests use `render()` from `ink` with a `PassThrough` stream as stdout and collect output via chunk events.
- The `applyExecutionEvent` reducer and `FlowWrapper` state machine are tested independently of React.
- See `CLAUDE.md` for the full testing conventions reference.
