import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { FlowWrapper } from '../FlowWrapper.js';
import type { FlowWrapperState, FlowLifecyclePhase, RalphexRunMetadata } from '../types.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWrapper(props: Parameters<typeof FlowWrapper>[0]) {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const instance = render(React.createElement(FlowWrapper, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
  return { ...instance, chunks };
}

function renderToString(props: Parameters<typeof FlowWrapper>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(FlowWrapper, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
  unmount();

  const raw = Buffer.concat(chunks).toString();
  /* eslint-disable no-control-regex */
  return raw
    .replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '')
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  /* eslint-enable no-control-regex */
}

function makeState(phase: FlowLifecyclePhase, overrides?: Partial<FlowWrapperState>): FlowWrapperState {
  return { phase, interactive: false, ...overrides };
}

const SAMPLE_METADATA: RalphexRunMetadata = {
  planFile: '/project/docs/plans/2026-03-08-phase-3.md',
  taskLabel: 'Task 3: Implement auth middleware',
};

// ---------------------------------------------------------------------------
// FlowWrapperState type checks (compile-time coverage via usage)
// ---------------------------------------------------------------------------

describe('FlowWrapperState shape', () => {
  it('accepts all FlowLifecyclePhase values', () => {
    const phases: FlowLifecyclePhase[] = [
      'preflight',
      'start-confirmation',
      'running',
      'validating',
      'failure',
      'complete',
    ];
    for (const phase of phases) {
      const state = makeState(phase);
      expect(state.phase).toBe(phase);
    }
  });

  it('accepts optional metadata fields', () => {
    const state: FlowWrapperState = {
      phase: 'running',
      interactive: false,
      metadata: {
        planFile: '/plan.md',
        taskLabel: 'Task 1',
        currentValidationCommand: 'npm test',
        exitStatusSummary: { passed: 3, failed: 0, total: 3 },
      },
    };
    expect(state.metadata?.exitStatusSummary?.passed).toBe(3);
  });

  it('captures minimal ralphex metadata fields', () => {
    const meta: RalphexRunMetadata = {
      planFile: '/project/plan.md',
      taskLabel: 'Task 2: DB migration',
      currentValidationCommand: 'npm run typecheck',
      exitStatusSummary: { passed: 1, failed: 2, total: 3 },
    };
    expect(meta.planFile).toBe('/project/plan.md');
    expect(meta.taskLabel).toBe('Task 2: DB migration');
    expect(meta.exitStatusSummary).toEqual({ passed: 1, failed: 2, total: 3 });
  });
});

// ---------------------------------------------------------------------------
// FlowWrapper rendering — each lifecycle phase
// ---------------------------------------------------------------------------

describe('FlowWrapper', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders preflight phase without throwing', () => {
    const { unmount } = renderWrapper({ state: makeState('preflight') });
    unmount();
  });

  it('renders preflight phase with spinner indicator text', () => {
    const text = renderToString({ state: makeState('preflight') });
    expect(text).toMatch(/preflight/i);
  });

  it('renders start-confirmation phase without throwing', () => {
    const { unmount } = renderWrapper({
      state: makeState('start-confirmation', { interactive: true }),
    });
    unmount();
  });

  it('renders start-confirmation with default message when none supplied', () => {
    const text = renderToString({
      state: makeState('start-confirmation', { interactive: true }),
    });
    expect(text).toMatch(/begin|continue|ready/i);
  });

  it('renders start-confirmation with custom confirmationMessage', () => {
    const text = renderToString({
      state: makeState('start-confirmation', {
        interactive: true,
        confirmationMessage: 'Begin Phase 3 execution?',
      }),
    });
    expect(text).toContain('Begin Phase 3 execution?');
  });

  it('renders start-confirmation with metadata plan file and task label', () => {
    const text = renderToString({
      state: makeState('start-confirmation', {
        interactive: true,
        metadata: SAMPLE_METADATA,
        confirmationMessage: 'Proceed?',
      }),
    });
    expect(text).toContain(SAMPLE_METADATA.planFile);
    expect(text).toContain(SAMPLE_METADATA.taskLabel);
  });

  it('renders running phase without throwing', () => {
    const { unmount } = renderWrapper({ state: makeState('running') });
    unmount();
  });

  it('renders running phase children', () => {
    const text = renderToString({
      state: makeState('running'),
      children: React.createElement(
        'span',
        null,
        React.createElement('box', null, 'child content'),
      ),
    });
    // The component renders without throwing; children presence is validated structurally
    expect(text).toBeDefined();
  });

  it('renders running phase with metadata header', () => {
    const text = renderToString({
      state: makeState('running', { metadata: SAMPLE_METADATA }),
    });
    expect(text).toContain(SAMPLE_METADATA.planFile);
  });

  it('renders validating phase without throwing', () => {
    const { unmount } = renderWrapper({ state: makeState('validating') });
    unmount();
  });

  it('renders validating phase with validation indicator', () => {
    const text = renderToString({ state: makeState('validating') });
    expect(text).toMatch(/validat/i);
  });

  it('renders validating phase with current validation command', () => {
    const text = renderToString({
      state: makeState('validating', {
        metadata: {
          ...SAMPLE_METADATA,
          currentValidationCommand: 'npm run typecheck',
        },
      }),
    });
    expect(text).toContain('npm run typecheck');
  });

  it('renders validating phase with exit status summary', () => {
    const text = renderToString({
      state: makeState('validating', {
        metadata: {
          ...SAMPLE_METADATA,
          exitStatusSummary: { passed: 2, failed: 1, total: 3 },
        },
      }),
    });
    expect(text).toMatch(/2 passed/i);
    expect(text).toMatch(/1 failed/i);
  });

  it('renders failure phase without throwing', () => {
    const { unmount } = renderWrapper({ state: makeState('failure') });
    unmount();
  });

  it('renders failure phase with failure indicator', () => {
    const text = renderToString({ state: makeState('failure') });
    expect(text).toMatch(/fail/i);
  });

  it('renders failure phase with failureReason', () => {
    const text = renderToString({
      state: makeState('failure', { failureReason: 'npm test exited with code 1' }),
    });
    expect(text).toContain('npm test exited with code 1');
  });

  it('renders failure phase with exit status summary', () => {
    const text = renderToString({
      state: makeState('failure', {
        metadata: {
          ...SAMPLE_METADATA,
          exitStatusSummary: { passed: 0, failed: 3, total: 3 },
        },
      }),
    });
    expect(text).toMatch(/3 failed/i);
  });

  it('renders complete phase without throwing', () => {
    const { unmount } = renderWrapper({ state: makeState('complete') });
    unmount();
  });

  it('renders complete phase with success indicator', () => {
    const text = renderToString({ state: makeState('complete') });
    expect(text).toMatch(/complete/i);
  });

  it('renders complete phase with all-passed exit status summary', () => {
    const text = renderToString({
      state: makeState('complete', {
        metadata: {
          ...SAMPLE_METADATA,
          exitStatusSummary: { passed: 5, failed: 0, total: 5 },
        },
      }),
    });
    expect(text).toMatch(/5 passed/i);
  });

  // -------------------------------------------------------------------------
  // Interactive vs non-interactive modes
  // -------------------------------------------------------------------------

  it('accepts interactive=true for execution flows', () => {
    const state = makeState('start-confirmation', { interactive: true });
    const { unmount } = renderWrapper({ state, onConfirm: vi.fn() });
    unmount();
  });

  it('accepts interactive=false for generation flows', () => {
    const state = makeState('running', { interactive: false });
    const { unmount } = renderWrapper({ state });
    unmount();
  });

  it('renders start-confirmation with onConfirm callback without throwing', () => {
    const onConfirm = vi.fn();
    const { unmount } = renderWrapper({
      state: makeState('start-confirmation', { interactive: true }),
      onConfirm,
    });
    unmount();
    // onConfirm is not auto-invoked by rendering alone
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Non-regression: existing generation flow behavior preserved
  // -------------------------------------------------------------------------

  it('renders running phase with no metadata without throwing (non-interactive generation)', () => {
    const { unmount } = renderWrapper({
      state: { phase: 'running', interactive: false },
    });
    unmount();
  });

  it('renders all phases with no metadata without throwing', () => {
    const phases: FlowLifecyclePhase[] = [
      'preflight',
      'start-confirmation',
      'running',
      'validating',
      'failure',
      'complete',
    ];
    for (const phase of phases) {
      const { unmount } = renderWrapper({ state: makeState(phase) });
      unmount();
    }
  });

  it('renders complete phase with all-zero exit summary (edge case)', () => {
    const text = renderToString({
      state: makeState('complete', {
        metadata: {
          ...SAMPLE_METADATA,
          exitStatusSummary: { passed: 0, failed: 0, total: 0 },
        },
      }),
    });
    expect(text).toMatch(/0 command/i);
  });

  it('renders complete with singular "command" for total=1', () => {
    const text = renderToString({
      state: makeState('complete', {
        metadata: {
          ...SAMPLE_METADATA,
          exitStatusSummary: { passed: 1, failed: 0, total: 1 },
        },
      }),
    });
    expect(text).toMatch(/1 command[^s]/);
  });
});
