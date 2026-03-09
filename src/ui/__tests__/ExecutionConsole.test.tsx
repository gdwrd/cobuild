import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ExecutionConsole, handleConsoleKey } from '../ExecutionConsole.js';
import type { ExecutionState } from '../types.js';
import { applyExecutionEvent, INITIAL_EXECUTION_STATE } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderConsole(state: ExecutionState, onUserAction?: () => void) {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

  const instance = render(
    React.createElement(ExecutionConsole, { state, onUserAction }),
    { stdout: stream as unknown as NodeJS.WriteStream },
  );
  return { ...instance, chunks };
}

const SAMPLE_TASK = {
  label: 'Task 3: Implement auth middleware',
  planFile: '/home/user/project/docs/plans/phase-3.md',
  phaseNumber: 3,
  phaseTitle: 'Auth middleware',
};

// ---------------------------------------------------------------------------
// applyExecutionEvent reducer tests
// ---------------------------------------------------------------------------

describe('applyExecutionEvent', () => {
  it('starts with idle phase and empty collections', () => {
    expect(INITIAL_EXECUTION_STATE.phase).toBe('idle');
    expect(INITIAL_EXECUTION_STATE.outputLines).toHaveLength(0);
    expect(INITIAL_EXECUTION_STATE.validationProgress).toHaveLength(0);
  });

  it('appends output lines', () => {
    let state = applyExecutionEvent(INITIAL_EXECUTION_STATE, { type: 'output-line', line: 'hello' });
    state = applyExecutionEvent(state, { type: 'output-line', line: 'world' });
    expect(state.outputLines).toEqual(['hello', 'world']);
  });

  it('task-start sets running phase and clears previous validation', () => {
    let state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      validationProgress: [{ command: 'npm test', status: 'passed' }],
    };
    state = applyExecutionEvent(state, { type: 'task-start', task: SAMPLE_TASK });
    expect(state.phase).toBe('running');
    expect(state.currentTask).toEqual(SAMPLE_TASK);
    expect(state.validationProgress).toHaveLength(0);
  });

  it('task-complete returns to running phase and clears currentTask', () => {
    let state = applyExecutionEvent(INITIAL_EXECUTION_STATE, { type: 'task-start', task: SAMPLE_TASK });
    state = applyExecutionEvent(state, { type: 'task-complete' });
    expect(state.phase).toBe('running');
    expect(state.currentTask).toBeUndefined();
  });

  it('validation-start adds a running entry', () => {
    const state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'validation-start',
      command: 'npm test',
    });
    expect(state.phase).toBe('validating');
    expect(state.validationProgress).toHaveLength(1);
    expect(state.validationProgress[0]).toMatchObject({ command: 'npm test', status: 'running' });
  });

  it('validation-result marks entry as passed on exit code 0', () => {
    let state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'validation-start',
      command: 'npm test',
    });
    state = applyExecutionEvent(state, {
      type: 'validation-result',
      command: 'npm test',
      exitCode: 0,
    });
    expect(state.validationProgress[0]).toMatchObject({
      command: 'npm test',
      status: 'passed',
      exitCode: 0,
    });
  });

  it('validation-result marks entry as failed on non-zero exit code', () => {
    let state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'validation-start',
      command: 'npm test',
    });
    state = applyExecutionEvent(state, {
      type: 'validation-result',
      command: 'npm test',
      exitCode: 1,
      output: '1 test failed',
    });
    expect(state.validationProgress[0]).toMatchObject({
      command: 'npm test',
      status: 'failed',
      exitCode: 1,
      output: '1 test failed',
    });
  });

  it('phase-change updates the phase field', () => {
    const state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'phase-change',
      phase: 'paused',
    });
    expect(state.phase).toBe('paused');
  });

  it('failure sets failed phase and failureReason', () => {
    const state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'failure',
      reason: 'Command not found: cobuild',
    });
    expect(state.phase).toBe('failed');
    expect(state.failureReason).toBe('Command not found: cobuild');
  });

  it('confirmation-request sets awaiting-confirmation and message', () => {
    const state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'confirmation-request',
      message: 'Proceed with destructive migration?',
    });
    expect(state.phase).toBe('awaiting-confirmation');
    expect(state.confirmationMessage).toBe('Proceed with destructive migration?');
  });

  it('multiple output-line events accumulate correctly', () => {
    let state = INITIAL_EXECUTION_STATE;
    for (let i = 0; i < 5; i++) {
      state = applyExecutionEvent(state, { type: 'output-line', line: `line ${i}` });
    }
    expect(state.outputLines).toHaveLength(5);
    expect(state.outputLines[4]).toBe('line 4');
  });

  it('task-start clears failureReason and confirmationMessage from previous run', () => {
    let state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      failureReason: 'previous error',
      confirmationMessage: 'old message',
    };
    state = applyExecutionEvent(state, { type: 'task-start', task: SAMPLE_TASK });
    expect(state.failureReason).toBeUndefined();
    expect(state.confirmationMessage).toBeUndefined();
  });

  it('validation-start deduplicates existing entry for same command', () => {
    let state = applyExecutionEvent(INITIAL_EXECUTION_STATE, {
      type: 'validation-start',
      command: 'npm test',
    });
    state = applyExecutionEvent(state, {
      type: 'validation-result',
      command: 'npm test',
      exitCode: 1,
    });
    // Re-run the same command (retry scenario)
    state = applyExecutionEvent(state, {
      type: 'validation-start',
      command: 'npm test',
    });
    expect(state.validationProgress).toHaveLength(1);
    expect(state.validationProgress[0].status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// ExecutionConsole component rendering tests
// ---------------------------------------------------------------------------

describe('ExecutionConsole', () => {
  it('renders idle state without throwing', () => {
    const { unmount } = renderConsole(INITIAL_EXECUTION_STATE);
    unmount();
  });

  it('renders preflight state without throwing', () => {
    const state: ExecutionState = { ...INITIAL_EXECUTION_STATE, phase: 'preflight' };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders running state with task header without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'running',
      currentTask: SAMPLE_TASK,
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders output lines without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'running',
      currentTask: SAMPLE_TASK,
      outputLines: ['line 1', 'line 2', 'line 3'],
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders more than MAX_VISIBLE_LINES output lines without throwing', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `output line ${i + 1}`);
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'running',
      currentTask: SAMPLE_TASK,
      outputLines: lines,
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders validating state with validation progress without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'validating',
      currentTask: SAMPLE_TASK,
      validationProgress: [
        { command: 'npm test', status: 'passed', exitCode: 0 },
        { command: 'npm run lint', status: 'running' },
        { command: 'npm run typecheck', status: 'pending' },
      ],
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders failed validation with output snippet without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'validating',
      validationProgress: [
        { command: 'npm test', status: 'failed', exitCode: 1, output: '3 tests failed' },
      ],
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders complete state without throwing', () => {
    const state: ExecutionState = { ...INITIAL_EXECUTION_STATE, phase: 'complete' };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders failed state with reason without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'failed',
      failureReason: 'ralphex exited with code 2',
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders failed state without reason without throwing', () => {
    const state: ExecutionState = { ...INITIAL_EXECUTION_STATE, phase: 'failed' };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders awaiting-confirmation state without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'awaiting-confirmation',
      confirmationMessage: 'Apply database migration?',
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders awaiting-confirmation with no message without throwing', () => {
    const state: ExecutionState = {
      ...INITIAL_EXECUTION_STATE,
      phase: 'awaiting-confirmation',
    };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('renders paused state without throwing', () => {
    const state: ExecutionState = { ...INITIAL_EXECUTION_STATE, phase: 'paused' };
    const { unmount } = renderConsole(state);
    unmount();
  });

  it('accepts an onUserAction callback without throwing', () => {
    const state: ExecutionState = { ...INITIAL_EXECUTION_STATE, phase: 'failed' };
    const { unmount } = renderConsole(state, () => {});
    unmount();
  });

  it('renders with all fields populated simultaneously without throwing', () => {
    const state: ExecutionState = {
      phase: 'validating',
      currentTask: SAMPLE_TASK,
      outputLines: ['building...', 'done.'],
      validationProgress: [
        { command: 'npm test', status: 'passed', exitCode: 0 },
        { command: 'npm run lint', status: 'failed', exitCode: 1, output: 'Lint error in foo.ts' },
      ],
    };
    const { unmount } = renderConsole(state);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// ExecutionEvent type completeness — verify all event types are accepted by applyExecutionEvent
// ---------------------------------------------------------------------------

describe('ExecutionEvent type coverage', () => {
  it('handles all event types without returning undefined', () => {
    const events = [
      { type: 'output-line' as const, line: 'x' },
      { type: 'task-start' as const, task: SAMPLE_TASK },
      { type: 'task-complete' as const },
      { type: 'validation-start' as const, command: 'npm test' },
      { type: 'validation-result' as const, command: 'npm test', exitCode: 0 },
      { type: 'phase-change' as const, phase: 'paused' as const },
      { type: 'failure' as const, reason: 'err' },
      { type: 'confirmation-request' as const, message: 'Continue?' },
    ];
    let state = INITIAL_EXECUTION_STATE;
    for (const event of events) {
      state = applyExecutionEvent(state, event);
      expect(state).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// ExecutionConsole keyboard interaction — useInput wiring
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// handleConsoleKey — pure key handler unit tests
// ---------------------------------------------------------------------------

describe('handleConsoleKey', () => {
  const noKey = { return: false };
  const returnKey = { return: true };

  it('calls retry when "r" is pressed in failed phase', () => {
    const handler = vi.fn();
    handleConsoleKey('r', noKey, 'failed', handler);
    expect(handler).toHaveBeenCalledWith('retry');
  });

  it('calls retry when "R" is pressed in failed phase (case-insensitive)', () => {
    const handler = vi.fn();
    handleConsoleKey('R', noKey, 'failed', handler);
    expect(handler).toHaveBeenCalledWith('retry');
  });

  it('does not call retry when "r" is pressed in non-failed phase', () => {
    const handler = vi.fn();
    handleConsoleKey('r', noKey, 'complete', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls inspect-logs when "l" is pressed in failed phase', () => {
    const handler = vi.fn();
    handleConsoleKey('l', noKey, 'failed', handler);
    expect(handler).toHaveBeenCalledWith('inspect-logs');
  });

  it('calls inspect-logs when "L" is pressed in complete phase', () => {
    const handler = vi.fn();
    handleConsoleKey('L', noKey, 'complete', handler);
    expect(handler).toHaveBeenCalledWith('inspect-logs');
  });

  it('does not call inspect-logs when "l" pressed in running phase', () => {
    const handler = vi.fn();
    handleConsoleKey('l', noKey, 'running', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls continue when "y" is pressed in awaiting-confirmation phase', () => {
    const handler = vi.fn();
    handleConsoleKey('y', noKey, 'awaiting-confirmation', handler);
    expect(handler).toHaveBeenCalledWith('continue');
  });

  it('calls continue when Enter is pressed in awaiting-confirmation phase', () => {
    const handler = vi.fn();
    handleConsoleKey('', returnKey, 'awaiting-confirmation', handler);
    expect(handler).toHaveBeenCalledWith('continue');
  });

  it('does not call continue when "y" pressed in non-awaiting-confirmation phase', () => {
    const handler = vi.fn();
    handleConsoleKey('y', noKey, 'running', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call any action when onUserAction is undefined', () => {
    // Should not throw
    handleConsoleKey('r', noKey, 'failed', undefined);
    handleConsoleKey('l', noKey, 'complete', undefined);
    handleConsoleKey('y', noKey, 'awaiting-confirmation', undefined);
  });

  it('does not call any action for unrecognized keys', () => {
    const handler = vi.fn();
    handleConsoleKey('q', noKey, 'failed', handler);
    handleConsoleKey('x', noKey, 'complete', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
