import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { GenerationScreen } from '../GenerationScreen.js';
import type { CompletedStage } from '../GenerationScreen.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function renderScreen(props: Parameters<typeof GenerationScreen>[0]) {
  const stream = new PassThrough();
  return render(React.createElement(GenerationScreen, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
}

function renderToString(props: Parameters<typeof GenerationScreen>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(GenerationScreen, props), {
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

describe('GenerationScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // Smoke tests — existing coverage preserved
  // -------------------------------------------------------------------------

  it('renders without throwing in generating state', () => {
    const { unmount } = renderScreen({ status: 'generating' });
    unmount();
  });

  it('renders without throwing in success state with a single file (legacy filePath prop)', () => {
    const { unmount } = renderScreen({ status: 'success', filePath: '/tmp/docs/spec.md' });
    unmount();
  });

  it('renders without throwing in success state with completed stages', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
    ];
    const { unmount } = renderScreen({
      status: 'success',
      completedStages: completed,
    });
    unmount();
  });

  it('renders without throwing in error state', () => {
    const { unmount } = renderScreen({ status: 'error', errorMessage: 'failed' });
    unmount();
  });

  it('renders architecture generation state without throwing', () => {
    const { unmount } = renderScreen({ status: 'generating', currentStage: 'architecture' });
    unmount();
  });

  it('renders plan generation state without throwing', () => {
    const { unmount } = renderScreen({ status: 'generating', currentStage: 'plan' });
    unmount();
  });

  it('renders dev-plan generation state without throwing', () => {
    const { unmount } = renderScreen({
      status: 'generating',
      currentStage: 'dev-plan',
      devPlanProgress: { current: 2, total: 5 },
    });
    unmount();
  });

  it('renders generating state with completed stages without throwing', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
    ];
    const { unmount } = renderScreen({
      status: 'generating',
      currentStage: 'architecture',
      completedStages: completed,
    });
    unmount();
  });

  it('renders dev-plan success state without throwing', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
      { label: 'Dev plan — phase 1', filePath: '/tmp/docs/plans/phase-1.md' },
      { label: 'Dev plan — phase 2', filePath: '/tmp/docs/plans/phase-2.md' },
    ];
    const { unmount } = renderScreen({
      status: 'success',
      completedStages: completed,
    });
    unmount();
  });

  it('renders without throwing in retry-exhausted state', () => {
    const { unmount } = renderScreen({ status: 'retry-exhausted', errorMessage: 'retries failed' });
    unmount();
  });

  it('renders retry-exhausted state with retry handler without throwing', () => {
    const onRetry = vi.fn();
    const { unmount } = renderScreen({
      status: 'retry-exhausted',
      errorMessage: 'Model request failed after 5 attempts',
      onRetry,
    });
    unmount();
  });

  // -------------------------------------------------------------------------
  // Stepper layout — spec-only state
  // -------------------------------------------------------------------------

  it('shows spec as done and other stages as pending on spec-only success', () => {
    const frame = renderToString({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    expect(frame).toContain('Project specification');
    expect(frame).toContain('Architecture document');
    expect(frame).toContain('High-level development plan');
    expect(frame).toContain('Per-phase dev plans');
  });

  it('shows spec file path on spec-only success (legacy filePath prop)', () => {
    const frame = renderToString({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    expect(frame).toContain('/tmp/docs/spec.md');
  });

  it('shows success summary on spec-only success', () => {
    const frame = renderToString({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    expect(frame).toContain('generated');
  });

  // -------------------------------------------------------------------------
  // Stepper layout — generating states
  // -------------------------------------------------------------------------

  it('shows spec stage as active when generating spec', () => {
    const frame = renderToString({
      status: 'generating',
      currentStage: 'spec',
    });
    // Stepper shows all 4 stages
    expect(frame).toContain('Project specification');
    expect(frame).toContain('Architecture document');
    expect(frame).toContain('High-level development plan');
    expect(frame).toContain('Per-phase dev plans');
  });

  it('shows completed spec and active architecture during arch generation', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
    ];
    const frame = renderToString({
      status: 'generating',
      currentStage: 'architecture',
      completedStages: completed,
    });
    expect(frame).toContain('/tmp/docs/spec.md');
    expect(frame).toContain('Architecture document');
  });

  it('shows dev-plan progress during dev-plan generation', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
    ];
    const frame = renderToString({
      status: 'generating',
      currentStage: 'dev-plan',
      completedStages: completed,
      devPlanProgress: { current: 3, total: 5 },
    });
    expect(frame).toContain('3');
    expect(frame).toContain('5');
    expect(frame).toContain('Per-phase dev plans');
  });

  it('shows previously completed dev plan phases during dev-plan generation', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
      { label: 'Dev plan — phase 1', filePath: '/tmp/docs/plans/phase-1.md' },
      { label: 'Dev plan — phase 2', filePath: '/tmp/docs/plans/phase-2.md' },
    ];
    const frame = renderToString({
      status: 'generating',
      currentStage: 'dev-plan',
      completedStages: completed,
      devPlanProgress: { current: 3, total: 5 },
    });
    expect(frame).toContain('/tmp/docs/plans/phase-1.md');
    expect(frame).toContain('/tmp/docs/plans/phase-2.md');
  });

  // -------------------------------------------------------------------------
  // Stepper layout — terminated-early states
  // -------------------------------------------------------------------------

  it('shows skipped label for stages after termination at architecture-decision', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
    ];
    const frame = renderToString({
      status: 'success',
      completedStages: completed,
      terminatedEarly: true,
    });
    expect(frame).toContain('skipped');
    expect(frame).toContain('/tmp/docs/spec.md');
  });

  it('shows skipped label for dev-plan after termination at plan-decision', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
    ];
    const frame = renderToString({
      status: 'success',
      completedStages: completed,
      terminatedEarly: true,
    });
    expect(frame).toContain('skipped');
    expect(frame).toContain('/tmp/docs/spec.md');
    expect(frame).toContain('/tmp/docs/arch.md');
  });

  it('shows all done on full success without termination', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
      { label: 'Dev plan — phase 1', filePath: '/tmp/docs/plans/p1.md' },
      { label: 'Dev plan — phase 2', filePath: '/tmp/docs/plans/p2.md' },
    ];
    const frame = renderToString({
      status: 'success',
      completedStages: completed,
    });
    expect(frame).not.toContain('skipped');
    expect(frame).toContain('/tmp/docs/spec.md');
    expect(frame).toContain('/tmp/docs/arch.md');
    expect(frame).toContain('/tmp/docs/plan.md');
    expect(frame).toContain('/tmp/docs/plans/p1.md');
    expect(frame).toContain('/tmp/docs/plans/p2.md');
  });

  it('shows dev-plan phase count on success', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
      { label: 'Dev plan — phase 1', filePath: '/tmp/docs/plans/p1.md' },
      { label: 'Dev plan — phase 2', filePath: '/tmp/docs/plans/p2.md' },
      { label: 'Dev plan — phase 3', filePath: '/tmp/docs/plans/p3.md' },
    ];
    const frame = renderToString({
      status: 'success',
      completedStages: completed,
    });
    expect(frame).toContain('3 phases');
  });

  // -------------------------------------------------------------------------
  // Stepper layout — error states
  // -------------------------------------------------------------------------

  it('shows failed marker and error message in error state', () => {
    const frame = renderToString({
      status: 'error',
      currentStage: 'spec',
      errorMessage: 'Connection refused',
    });
    expect(frame).toContain('Connection refused');
    expect(frame).toContain('any key to exit');
  });

  it('shows retry-exhausted message and keybinding hint', () => {
    const frame = renderToString({
      status: 'retry-exhausted',
      currentStage: 'architecture',
      errorMessage: 'All retry attempts failed',
    });
    expect(frame).toContain('All retry attempts failed');
    expect(frame).toContain('retry');
  });

  it('shows all 4 workflow stages in any state', () => {
    for (const status of ['generating', 'success', 'error', 'retry-exhausted'] as const) {
      const frame = renderToString({ status });
      expect(frame).toContain('Project specification');
      expect(frame).toContain('Architecture document');
      expect(frame).toContain('High-level development plan');
      expect(frame).toContain('Per-phase dev plans');
    }
  });

  // -------------------------------------------------------------------------
  // Stable success completion (no auto-exit)
  // -------------------------------------------------------------------------

  it('shows press-any-key hint in success state instead of auto-exiting', () => {
    const frame = renderToString({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    expect(frame).toContain('Press any key to exit');
  });

  it('shows artifacts path hint in success state', () => {
    const frame = renderToString({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    expect(frame).toContain('docs/');
  });

  it('shows press-any-key hint in success state for full dev-plan run', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
      { label: 'Dev plan — phase 1', filePath: '/tmp/docs/plans/p1.md' },
    ];
    const frame = renderToString({ status: 'success', completedStages: completed });
    expect(frame).toContain('Press any key to exit');
  });

  // -------------------------------------------------------------------------
  // Retry-exhausted: stage-aware messaging
  // -------------------------------------------------------------------------

  it('shows failed stage name in retry-exhausted footer', () => {
    const frame = renderToString({
      status: 'retry-exhausted',
      currentStage: 'architecture',
      errorMessage: 'All retries failed',
    });
    expect(frame).toContain('Architecture document');
    expect(frame).toContain('after all retry attempts');
  });

  it('shows failed stage name for spec in retry-exhausted footer', () => {
    const frame = renderToString({
      status: 'retry-exhausted',
      currentStage: 'spec',
      errorMessage: 'Model did not respond',
    });
    expect(frame).toContain('Project specification');
    expect(frame).toContain('after all retry attempts');
  });

  it('shows failed stage name for plan in retry-exhausted footer', () => {
    const frame = renderToString({
      status: 'retry-exhausted',
      currentStage: 'plan',
    });
    expect(frame).toContain('High-level development plan');
    expect(frame).toContain('after all retry attempts');
  });

  // -------------------------------------------------------------------------
  // Error state: stage-aware messaging
  // -------------------------------------------------------------------------

  it('shows failed stage name in error footer', () => {
    const frame = renderToString({
      status: 'error',
      currentStage: 'architecture',
      errorMessage: 'Unexpected error',
    });
    expect(frame).toContain('Architecture document');
    expect(frame).toContain('Press any key to exit');
  });

  it('shows failed stage name for dev-plan in error footer', () => {
    const frame = renderToString({
      status: 'error',
      currentStage: 'dev-plan',
      errorMessage: 'Dev plan generation failed',
    });
    expect(frame).toContain('Per-phase dev plans');
    expect(frame).toContain('Press any key to exit');
  });
});
