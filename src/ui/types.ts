/**
 * UI State Model — shared contracts for cobuild's Ink-based terminal UI
 *
 * Architecture layering:
 *
 *   ScreenController (orchestrator)
 *     └─ manages Screen transitions and shared state
 *        ├─ App (interview/main screen)
 *        ├─ GenerationScreen (artifact generation stepper)
 *        ├─ YesNoPrompt (decision screen)
 *        ├─ RestoredSession (resume interstitial)
 *        └─ [future] ExecutionConsole (ralphex plan execution screen)
 *
 * Extension seam for ralphex execution:
 *   When a future ralphex execution flow is added, it should:
 *   1. Add 'execution' to the Screen union below (and optionally sub-states)
 *   2. Populate ExecutionState in ScreenController when entering that screen
 *   3. Mount an ExecutionConsole component using the same shell chrome
 *      (SharedUIState header/footer/notice/error) without special-casing
 *      the ScreenController render function beyond a new `if (screen === 'execution')` branch.
 *
 *   This keeps the execution UX decoupled from artifact-generation UX
 *   and avoids a second, parallel UI architecture.
 */

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------

/**
 * The exhaustive set of top-level screens managed by ScreenController.
 * 'execution' is declared here as a forward reference for the ralphex execution
 * console — see ExecutionConsole.tsx and the extension-seam notes above.
 * No code currently transitions to 'execution'; it becomes active when a real
 * runner is plugged in (see applyExecutionEvent / ExecutionConsole contract).
 */
export type Screen = 'startup' | 'restored' | 'main' | 'generating' | 'yesno' | 'error' | 'execution';

/**
 * Session lifecycle stage, mirroring the session schema's `stage` field.
 * Kept here so UI components can reference it without importing session internals.
 */
export type SessionStage = 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';

// ---------------------------------------------------------------------------
// Shared chrome data — status header, footer help, notices, errors
// ---------------------------------------------------------------------------

/**
 * Data shown in the persistent status header visible on all screens.
 * Screens should populate this from ScreenController state rather than
 * reaching into provider or session internals directly.
 */
export interface StatusHeaderData {
  /** Short session identifier (e.g. first 8 chars of UUID). */
  sessionId: string;
  /** Current lifecycle stage of the session. */
  stage: SessionStage;
  /** Active provider name (e.g. 'ollama', 'codex-cli'). */
  provider: string;
  /** Active model name; omitted when provider does not surface a model concept. */
  model?: string;
  /** Whether the active provider is currently reachable. */
  providerReady: boolean;
  /** App version string shown alongside session info. */
  version: string;
  /**
   * Short human-readable context describing how this session was obtained,
   * e.g. "resumed from dev-plans" or "new session". Shown in the header
   * when set. Also used by the future execution mode to surface task context
   * (e.g. "phase 3/5") in the same header slot without changing the shell.
   */
  resumabilityContext?: string;
}

/**
 * Screen-specific help data rendered in the footer area.
 * Each screen supplies its own commands and keybindings so the
 * footer stays relevant without hardcoding interview-only content.
 */
export interface FooterHelpData {
  /** Slash commands available on this screen (e.g. '/finish-now', '/model'). */
  commands: string[];
  /** Human-readable keybinding hints (e.g. 'ctrl+c: quit', 'r: retry'). */
  keybindings: string[];
}

/**
 * Progress data for a multi-step operation (generation phase, dev-plan iteration, etc.).
 * Used by screens that display a "N of M" progress indicator.
 */
export interface StageProgressData {
  /** 1-based index of the step currently in progress. */
  current: number;
  /** Total number of steps in this operation. */
  total: number;
  /** Optional human-readable label for the current step. */
  label?: string;
}

/**
 * A notice message with severity level, shown in a persistent notice area.
 * Warnings and errors persist until resolved; info notices may auto-dismiss.
 */
export interface NoticeData {
  message: string;
  level: 'info' | 'warning' | 'error';
}

/**
 * The minimal shared state contract that any screen component can consume
 * to render consistent chrome (header, footer, notices, errors) without
 * coupling to provider or generator internals.
 */
export interface SharedUIState {
  header: StatusHeaderData;
  footer?: FooterHelpData;
  notice?: NoticeData;
  /** Transient error text shown in the screen's error area. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Execution state — dormant shape for future ralphex plan runs
// ---------------------------------------------------------------------------

/**
 * Lifecycle phase of a long-running execution flow (e.g. a ralphex plan run).
 *
 * State machine sketch:
 *   idle → preflight → running → validating → complete
 *                              ↘ paused → running
 *                              ↘ failed
 *                              ↘ awaiting-confirmation → running
 */
export type ExecutionPhase =
  | 'idle'
  | 'preflight'
  | 'running'
  | 'validating'
  | 'paused'
  | 'failed'
  | 'awaiting-confirmation'
  | 'complete';

/**
 * Metadata about the plan task currently being executed.
 * Populated when ExecutionPhase is 'running', 'validating', or 'paused'.
 */
export interface ExecutionTask {
  /** Human-readable task label (e.g. "Task 3: Implement auth middleware"). */
  label: string;
  /** Absolute path to the plan file being executed. */
  planFile: string;
  /** Phase number within the plan (1-based). */
  phaseNumber: number;
  /** Phase title string. */
  phaseTitle: string;
}

/**
 * Progress tracking for a single validation command run during or after a task.
 */
export interface ValidationCommandProgress {
  /** The command string as it appears in the plan (e.g. "npm test"). */
  command: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  /** Exit code; defined once status is 'passed' or 'failed'. */
  exitCode?: number;
  /** Captured stdout/stderr snippet; may be truncated for display. */
  output?: string;
}

/**
 * State shape for a ralphex plan execution run.
 *
 * This interface is intentionally dormant — it is defined here so that
 * the ScreenController and a future ExecutionConsole component share a
 * stable contract from the start. When actual execution support lands:
 *   1. ScreenController adds `executionState` to its useState set.
 *   2. An ExecutionConsole component renders from this state.
 *   3. No other UI files need structural changes.
 *
 * Keep this type up to date as the execution feature is designed.
 */
export interface ExecutionState {
  /** Current phase of the execution lifecycle. */
  phase: ExecutionPhase;
  /** The task being executed; undefined when phase is 'idle' or 'preflight'. */
  currentTask?: ExecutionTask;
  /** Streamed output lines from the subprocess, in order of arrival. */
  outputLines: string[];
  /** Progress of any validation commands associated with the current task. */
  validationProgress: ValidationCommandProgress[];
  /** Human-readable reason for a 'failed' phase. */
  failureReason?: string;
  /**
   * Message shown to the user when phase is 'awaiting-confirmation'.
   * The UI should block until the user acknowledges before continuing.
   */
  confirmationMessage?: string;
}

/** Empty ExecutionState used as an initial value before any events are applied. */
export const INITIAL_EXECUTION_STATE: ExecutionState = {
  phase: 'idle',
  outputLines: [],
  validationProgress: [],
};

// ---------------------------------------------------------------------------
// Flow wrapper — shared lifecycle patterns for generation and execution flows
// ---------------------------------------------------------------------------

/**
 * Lifecycle phases of a long-running flow, shared by both artifact generation
 * (non-interactive) and future ralphex execution (interactive).
 *
 * State machine:
 *   preflight → start-confirmation (interactive) → running → validating → complete
 *                                                  ↘ failure
 *   preflight → running (non-interactive) → validating → complete
 *                                         ↘ failure
 */
export type FlowLifecyclePhase =
  | 'preflight'
  | 'start-confirmation'
  | 'running'
  | 'validating'
  | 'failure'
  | 'complete';

/**
 * Minimal metadata captured for each long-running flow run, especially for
 * future ralphex wrapping. All fields required for the execution seam are
 * present here so a runner can populate them without modifying the wrapper API.
 */
export interface RalphexRunMetadata {
  /** Absolute path to the plan file being executed or generated against. */
  planFile: string;
  /** Human-readable label for the current task (e.g. "Task 3: Auth middleware"). */
  taskLabel: string;
  /** The validation command currently running, if any. */
  currentValidationCommand?: string;
  /**
   * Summary of validation command outcomes for the completed or in-progress run.
   * Suitable for a concise "N passed, M failed" completion line.
   */
  exitStatusSummary?: {
    passed: number;
    failed: number;
    total: number;
  };
}

/**
 * State shape for the FlowWrapper component, combining lifecycle phase with
 * metadata and interaction flags. Suitable for React's useState.
 *
 * Usage:
 *   - Generation flows: start at 'running', interactive=false, no confirmation
 *   - Execution flows: start at 'preflight', interactive=true, confirmationMessage set
 *     before 'start-confirmation' phase
 */
export interface FlowWrapperState {
  /** Current lifecycle phase of this flow. */
  phase: FlowLifecyclePhase;
  /**
   * Whether this flow requires user acknowledgement at the start-confirmation
   * phase before proceeding. Generation flows are non-interactive (false);
   * execution flows are interactive (true).
   */
  interactive: boolean;
  /** Metadata about the plan and task associated with this flow run. */
  metadata?: RalphexRunMetadata;
  /** Message shown to the user in 'start-confirmation' phase. */
  confirmationMessage?: string;
  /** Reason string shown in 'failure' phase. */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Execution event model — controller-facing API for driving ExecutionConsole
// ---------------------------------------------------------------------------

/**
 * Discrete events emitted by a subprocess runner or test fixture to drive the
 * ExecutionConsole UI state. Designed to be framework-agnostic so any runner
 * (ralphex, a direct child process, a mock) can produce events without
 * knowing about React state.
 *
 * Usage:
 *   const [state, dispatch] = useReducer(applyExecutionEvent, INITIAL_EXECUTION_STATE);
 *   runner.on('event', dispatch);
 */
export type ExecutionEvent =
  /** A line of subprocess stdout/stderr output arrived. */
  | { type: 'output-line'; line: string }
  /** A new task boundary was crossed — the runner moved to a new plan task. */
  | { type: 'task-start'; task: ExecutionTask }
  /** The current task finished without error. */
  | { type: 'task-complete' }
  /** A validation command is about to run. */
  | { type: 'validation-start'; command: string }
  /** A validation command finished. */
  | { type: 'validation-result'; command: string; exitCode: number; output?: string }
  /** The execution lifecycle phase changed (e.g. running → validating). */
  | { type: 'phase-change'; phase: ExecutionPhase }
  /** The run encountered a fatal or non-retryable failure. */
  | { type: 'failure'; reason: string }
  /** The runner needs acknowledgement from the user before continuing. */
  | { type: 'confirmation-request'; message: string };

/**
 * User-initiated actions that the ExecutionConsole surfaces as callbacks.
 * ScreenController (or a future runner integration) handles these to update
 * execution state or interact with the subprocess.
 */
export type ExecutionUserAction = 'retry' | 'continue' | 'inspect-logs';

/**
 * Pure reducer that applies a single ExecutionEvent to the current
 * ExecutionState and returns the next state. Suitable for React's useReducer.
 *
 * Keeping this outside the component makes it independently testable and
 * allows non-React consumers (e.g. an integration test or CLI shim) to
 * maintain execution state without mounting a component tree.
 */
export function applyExecutionEvent(state: ExecutionState, event: ExecutionEvent): ExecutionState {
  switch (event.type) {
    case 'output-line':
      return { ...state, outputLines: [...state.outputLines, event.line] };

    case 'task-start':
      return {
        ...state,
        phase: 'running',
        currentTask: event.task,
        // Clear previous validation progress when a new task starts
        validationProgress: [],
        failureReason: undefined,
        confirmationMessage: undefined,
      };

    case 'task-complete':
      return { ...state, phase: 'complete', currentTask: undefined };

    case 'validation-start':
      return {
        ...state,
        phase: 'validating',
        validationProgress: [
          ...state.validationProgress.filter((v) => v.command !== event.command),
          { command: event.command, status: 'running' },
        ],
      };

    case 'validation-result': {
      const status: ValidationCommandProgress['status'] =
        event.exitCode === 0 ? 'passed' : 'failed';
      return {
        ...state,
        validationProgress: state.validationProgress.map((v) =>
          v.command === event.command
            ? { ...v, status, exitCode: event.exitCode, output: event.output }
            : v,
        ),
      };
    }

    case 'phase-change':
      return { ...state, phase: event.phase };

    case 'failure':
      return { ...state, phase: 'failed', failureReason: event.reason };

    case 'confirmation-request':
      return {
        ...state,
        phase: 'awaiting-confirmation',
        confirmationMessage: event.message,
      };

    default:
      return state;
  }
}
