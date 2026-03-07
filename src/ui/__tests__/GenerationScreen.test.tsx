import { describe, it, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { GenerationScreen } from '../GenerationScreen.js';
import type { CompletedStage } from '../GenerationScreen.js';

function renderScreen(props: Parameters<typeof GenerationScreen>[0]) {
  const stream = new PassThrough();
  return render(React.createElement(GenerationScreen, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
}

describe('GenerationScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing in generating state', () => {
    const { unmount } = renderScreen({ status: 'generating' });
    unmount();
  });

  it('renders without throwing in success state with a single file', () => {
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
});
