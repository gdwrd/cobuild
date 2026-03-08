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
- `ExecutionState`, `ExecutionEvent`, `applyExecutionEvent` — the execution console state model and event reducer
- `FlowLifecyclePhase`, `RalphexRunMetadata`, `FlowWrapperState` — lifecycle wrapper types used by `FlowWrapper`

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
| `QUIT_FOOTER` | Restored session, execution | — | `ctrl+c: quit` |
| `YESNO_FOOTER` | Decision prompts (`yesno`) | — | `y: yes  n: no  ctrl+c: quit` |
| `GENERATING_FOOTER` | Generation stepper | — | `ctrl+c: quit` |

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
