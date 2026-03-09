import { describe, it, expect } from 'vitest';
import type {
  Screen,
  SessionStage,
  StatusHeaderData,
  FooterHelpData,
  StageProgressData,
  NoticeData,
  SharedUIState,
  ScrollState,
  SelectionState,
  BannerData,
  CompletionState,
  ExecutionPhase,
  ExecutionTask,
  ValidationCommandProgress,
  ExecutionState,
} from '../types.js';
import { INITIAL_SCROLL_STATE } from '../types.js';

// ---------------------------------------------------------------------------
// Type-level compile checks: if any of these object literals fail to
// satisfy their interface the test file itself will not compile.
// ---------------------------------------------------------------------------

const minimalHeader: StatusHeaderData = {
  sessionId: 'abc12345',
  stage: 'interview',
  provider: 'ollama',
  providerReady: true,
  version: '0.1.0',
};

const fullHeader: StatusHeaderData = {
  sessionId: 'abc12345',
  stage: 'dev-plans',
  provider: 'codex-cli',
  model: 'gpt-4o',
  providerReady: false,
  version: '1.2.3',
};

const footer: FooterHelpData = {
  commands: ['/finish-now', '/model', '/provider'],
  keybindings: ['ctrl+c: quit'],
};

const progress: StageProgressData = {
  current: 2,
  total: 5,
  label: 'Generating spec',
};

const notice: NoticeData = {
  message: 'Provider unavailable',
  level: 'warning',
};

const sharedState: SharedUIState = {
  header: minimalHeader,
  footer,
  notice,
  error: 'Something went wrong',
};

const minimalSharedState: SharedUIState = {
  header: minimalHeader,
};

// ---------------------------------------------------------------------------
// New shared state type literals — compile checks
// ---------------------------------------------------------------------------

const followingScroll: ScrollState = {
  autoFollow: true,
  scrollbackLines: 0,
};

const scrolledBack: ScrollState = {
  autoFollow: false,
  scrollbackLines: 5,
};

const selection: SelectionState = {
  selectedIndex: 2,
  itemCount: 8,
};

const dismissibleBanner: BannerData = {
  id: 'provider-unavailable',
  message: 'Active provider is not reachable. Use /provider to switch.',
  level: 'warning',
  dismissible: false,
};

const infoBanner: BannerData = {
  id: 'session-halted',
  message: 'Previous run was halted. Press R to retry from the failed phase.',
  level: 'info',
  dismissible: true,
};

const minimalCompletion: CompletionState = {
  isComplete: true,
};

const fullCompletion: CompletionState = {
  isComplete: true,
  summary: 'All artifacts generated.',
  artifactPaths: ['/project/docs/plans/2026-01-01-spec.md', '/project/docs/plans/2026-01-01-arch.md'],
  nextAction: 'Review docs/plans/ then run ralphex to execute.',
};

const task: ExecutionTask = {
  label: 'Task 3: Implement auth middleware',
  planFile: '/home/user/docs/plans/2026-01-01-phase-1-setup.md',
  phaseNumber: 1,
  phaseTitle: 'Foundation',
};

const validationCmd: ValidationCommandProgress = {
  command: 'npm test',
  status: 'passed',
  exitCode: 0,
};

const failedValidationCmd: ValidationCommandProgress = {
  command: 'npm run lint',
  status: 'failed',
  exitCode: 1,
  output: 'Error: 3 problems (2 errors, 1 warning)',
};

const idleExecution: ExecutionState = {
  phase: 'idle',
  outputLines: [],
  validationProgress: [],
};

const runningExecution: ExecutionState = {
  phase: 'running',
  currentTask: task,
  outputLines: ['Starting...', 'Done.'],
  validationProgress: [validationCmd, failedValidationCmd],
  confirmationMessage: undefined,
  failureReason: undefined,
};

const failedExecution: ExecutionState = {
  phase: 'failed',
  currentTask: task,
  outputLines: ['Step 1', 'ERROR: step 2 failed'],
  validationProgress: [failedValidationCmd],
  failureReason: 'Validation command exited with code 1',
};

// ---------------------------------------------------------------------------
// Runtime value tests
// ---------------------------------------------------------------------------

describe('UI state types — Screen', () => {
  const screens: Screen[] = ['startup', 'restored', 'main', 'generating', 'yesno', 'error', 'execution'];

  it('covers all expected screen values', () => {
    expect(screens).toHaveLength(7);
  });

  it.each(screens)('"%s" is a valid Screen value', (s) => {
    expect(typeof s).toBe('string');
  });
});

describe('UI state types — SessionStage', () => {
  const stages: SessionStage[] = ['interview', 'spec', 'architecture', 'plan', 'dev-plans'];

  it('covers all expected session stage values', () => {
    expect(stages).toHaveLength(5);
  });

  it.each(stages)('"%s" is a valid SessionStage value', (s) => {
    expect(typeof s).toBe('string');
  });
});

describe('UI state types — StatusHeaderData', () => {
  it('constructs minimal header without optional fields', () => {
    expect(minimalHeader.sessionId).toBe('abc12345');
    expect(minimalHeader.model).toBeUndefined();
    expect(minimalHeader.providerReady).toBe(true);
  });

  it('constructs full header with all optional fields', () => {
    expect(fullHeader.model).toBe('gpt-4o');
    expect(fullHeader.providerReady).toBe(false);
    expect(fullHeader.stage).toBe('dev-plans');
  });
});

describe('UI state types — FooterHelpData', () => {
  it('holds commands and keybindings arrays', () => {
    expect(footer.commands).toContain('/finish-now');
    expect(footer.keybindings).toContain('ctrl+c: quit');
  });
});

describe('UI state types — StageProgressData', () => {
  it('holds current and total with optional label', () => {
    expect(progress.current).toBe(2);
    expect(progress.total).toBe(5);
    expect(progress.label).toBe('Generating spec');
  });

  it('accepts progress without label', () => {
    const p: StageProgressData = { current: 1, total: 3 };
    expect(p.label).toBeUndefined();
  });
});

describe('UI state types — NoticeData', () => {
  it('holds message and level', () => {
    expect(notice.level).toBe('warning');
  });

  it.each(['info', 'warning', 'error'] as const)('level "%s" is valid', (level) => {
    const n: NoticeData = { message: 'test', level };
    expect(n.level).toBe(level);
  });
});

describe('UI state types — SharedUIState', () => {
  it('accepts full state with optional fields', () => {
    expect(sharedState.header).toBe(minimalHeader);
    expect(sharedState.notice?.level).toBe('warning');
    expect(sharedState.error).toBe('Something went wrong');
  });

  it('accepts minimal state with only header required', () => {
    expect(minimalSharedState.footer).toBeUndefined();
    expect(minimalSharedState.notice).toBeUndefined();
    expect(minimalSharedState.error).toBeUndefined();
  });
});

describe('UI state types — ExecutionPhase', () => {
  const phases: ExecutionPhase[] = [
    'idle', 'preflight', 'running', 'validating',
    'paused', 'failed', 'awaiting-confirmation', 'complete',
  ];

  it('covers all expected execution phase values', () => {
    expect(phases).toHaveLength(8);
  });

  it.each(phases)('"%s" is a valid ExecutionPhase value', (p) => {
    expect(typeof p).toBe('string');
  });
});

describe('UI state types — ExecutionTask', () => {
  it('holds task metadata', () => {
    expect(task.phaseNumber).toBe(1);
    expect(task.planFile).toContain('docs/plans');
    expect(task.label).toContain('Task 3');
  });
});

describe('UI state types — ValidationCommandProgress', () => {
  it('constructs passed command progress', () => {
    expect(validationCmd.status).toBe('passed');
    expect(validationCmd.exitCode).toBe(0);
    expect(validationCmd.output).toBeUndefined();
  });

  it('constructs failed command progress with output', () => {
    expect(failedValidationCmd.status).toBe('failed');
    expect(failedValidationCmd.exitCode).toBe(1);
    expect(failedValidationCmd.output).toContain('errors');
  });

  it.each(['pending', 'running', 'passed', 'failed'] as const)('status "%s" is valid', (status) => {
    const v: ValidationCommandProgress = { command: 'npm test', status };
    expect(v.status).toBe(status);
  });
});

describe('UI state types — ScrollState', () => {
  it('INITIAL_SCROLL_STATE has autoFollow true and zero scrollback', () => {
    expect(INITIAL_SCROLL_STATE.autoFollow).toBe(true);
    expect(INITIAL_SCROLL_STATE.scrollbackLines).toBe(0);
  });

  it('constructs an auto-following scroll state', () => {
    expect(followingScroll.autoFollow).toBe(true);
    expect(followingScroll.scrollbackLines).toBe(0);
  });

  it('constructs a scrolled-back state', () => {
    expect(scrolledBack.autoFollow).toBe(false);
    expect(scrolledBack.scrollbackLines).toBe(5);
  });
});

describe('UI state types — SelectionState', () => {
  it('holds selectedIndex and itemCount', () => {
    expect(selection.selectedIndex).toBe(2);
    expect(selection.itemCount).toBe(8);
  });

  it('accepts zero-based selectedIndex at boundary values', () => {
    const first: SelectionState = { selectedIndex: 0, itemCount: 3 };
    const last: SelectionState = { selectedIndex: 2, itemCount: 3 };
    expect(first.selectedIndex).toBe(0);
    expect(last.selectedIndex).toBe(last.itemCount - 1);
  });
});

describe('UI state types — BannerData', () => {
  it('constructs a non-dismissible warning banner', () => {
    expect(dismissibleBanner.dismissible).toBe(false);
    expect(dismissibleBanner.level).toBe('warning');
    expect(dismissibleBanner.id).toBe('provider-unavailable');
  });

  it('constructs a dismissible info banner', () => {
    expect(infoBanner.dismissible).toBe(true);
    expect(infoBanner.level).toBe('info');
    expect(infoBanner.id).toBe('session-halted');
  });

  it.each(['info', 'warning', 'error'] as const)('level "%s" is valid for BannerData', (level) => {
    const b: BannerData = { id: 'test', message: 'msg', level, dismissible: true };
    expect(b.level).toBe(level);
  });
});

describe('UI state types — CompletionState', () => {
  it('constructs minimal completion state with only isComplete', () => {
    expect(minimalCompletion.isComplete).toBe(true);
    expect(minimalCompletion.summary).toBeUndefined();
    expect(minimalCompletion.artifactPaths).toBeUndefined();
    expect(minimalCompletion.nextAction).toBeUndefined();
  });

  it('constructs full completion state with summary, paths, and next action', () => {
    expect(fullCompletion.isComplete).toBe(true);
    expect(fullCompletion.summary).toBe('All artifacts generated.');
    expect(fullCompletion.artifactPaths).toHaveLength(2);
    expect(fullCompletion.artifactPaths?.[0]).toContain('docs/plans');
    expect(fullCompletion.nextAction).toContain('ralphex');
  });

  it('accepts an incomplete completion state (isComplete: false)', () => {
    const pending: CompletionState = { isComplete: false };
    expect(pending.isComplete).toBe(false);
  });
});

describe('UI state types — ExecutionState', () => {
  it('constructs idle state with empty arrays', () => {
    expect(idleExecution.phase).toBe('idle');
    expect(idleExecution.currentTask).toBeUndefined();
    expect(idleExecution.outputLines).toHaveLength(0);
    expect(idleExecution.validationProgress).toHaveLength(0);
  });

  it('constructs running state with task and output', () => {
    expect(runningExecution.phase).toBe('running');
    expect(runningExecution.currentTask?.label).toContain('Task 3');
    expect(runningExecution.outputLines).toHaveLength(2);
    expect(runningExecution.validationProgress).toHaveLength(2);
  });

  it('constructs failed state with failure reason', () => {
    expect(failedExecution.phase).toBe('failed');
    expect(failedExecution.failureReason).toContain('exit');
  });
});
