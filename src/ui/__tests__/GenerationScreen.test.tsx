import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { GenerationScreen } from '../GenerationScreen.js';
import type { GenerationScreenProps, CompletedStage } from '../GenerationScreen.js';

function renderScreen(props: GenerationScreenProps): { output: string; unmount: () => void } {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(GenerationScreen, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });

  stream.end();
  const raw = Buffer.concat(chunks).toString();
  /* eslint-disable no-control-regex */
  const stripped = raw
    .replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '')
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  /* eslint-enable no-control-regex */
  return { output: stripped, unmount };
}

describe('GenerationScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing in generating state', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(GenerationScreen, { status: 'generating' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing in success state', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(GenerationScreen, { status: 'success', filePath: '/tmp/docs/spec.md' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing in error state', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(GenerationScreen, { status: 'error', errorMessage: 'failed' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('includes spec generation header in generating state output', () => {
    const { output, unmount } = renderScreen({ status: 'generating' });
    unmount();
    expect(output).toContain('Spec Generation');
  });

  it('includes progress text in generating state output', () => {
    const { output, unmount } = renderScreen({ status: 'generating' });
    unmount();
    expect(output).toContain('Creating project specification');
  });

  it('includes success message in success state output', () => {
    const { output, unmount } = renderScreen({
      status: 'success',
      filePath: '/tmp/docs/my-project-spec.md',
    });
    unmount();
    expect(output).toContain('Specification generated successfully');
  });

  it('includes file path in success state output', () => {
    const { output, unmount } = renderScreen({
      status: 'success',
      filePath: '/tmp/docs/my-project-spec.md',
    });
    unmount();
    expect(output).toContain('/tmp/docs/my-project-spec.md');
  });

  it('does not include spinner text in success state output', () => {
    const { output, unmount } = renderScreen({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    unmount();
    expect(output).not.toContain('Creating project specification');
  });

  it('includes error message in error state output', () => {
    const { output, unmount } = renderScreen({
      status: 'error',
      errorMessage: 'Provider unreachable',
    });
    unmount();
    expect(output).toContain('Provider unreachable');
  });

  it('includes fallback error text when no errorMessage provided', () => {
    const { output, unmount } = renderScreen({ status: 'error' });
    unmount();
    expect(output).toContain('Spec generation failed');
  });

  it('does not include success text in error state output', () => {
    const { output, unmount } = renderScreen({ status: 'error', errorMessage: 'oops' });
    unmount();
    expect(output).not.toContain('Specification generated successfully');
  });

  it('does not render document content in success state', () => {
    const { output, unmount } = renderScreen({
      status: 'success',
      filePath: '/tmp/docs/spec.md',
    });
    unmount();
    expect(output).not.toContain('# Project Overview');
    expect(output).not.toContain('Functional Requirements');
  });

  it('shows architecture generation header when currentStage is architecture', () => {
    const { output, unmount } = renderScreen({ status: 'generating', currentStage: 'architecture' });
    unmount();
    expect(output).toContain('Architecture Generation');
  });

  it('shows architecture spinner text when currentStage is architecture', () => {
    const { output, unmount } = renderScreen({ status: 'generating', currentStage: 'architecture' });
    unmount();
    expect(output).toContain('Creating architecture document');
  });

  it('shows plan generation header when currentStage is plan', () => {
    const { output, unmount } = renderScreen({ status: 'generating', currentStage: 'plan' });
    unmount();
    expect(output).toContain('Plan Generation');
  });

  it('shows plan spinner text when currentStage is plan', () => {
    const { output, unmount } = renderScreen({ status: 'generating', currentStage: 'plan' });
    unmount();
    expect(output).toContain('Creating high-level development plan');
  });

  it('shows completed stages with file paths when provided', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
    ];
    const { output, unmount } = renderScreen({
      status: 'generating',
      currentStage: 'architecture',
      completedStages: completed,
    });
    unmount();
    expect(output).toContain('Project specification');
    expect(output).toContain('/tmp/docs/spec.md');
  });

  it('shows all completed stages in success state', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
      { label: 'High-level development plan', filePath: '/tmp/docs/plan.md' },
    ];
    const { output, unmount } = renderScreen({
      status: 'success',
      completedStages: completed,
    });
    unmount();
    expect(output).toContain('/tmp/docs/spec.md');
    expect(output).toContain('/tmp/docs/arch.md');
    expect(output).toContain('/tmp/docs/plan.md');
    expect(output).toContain('All artifacts generated successfully');
  });

  it('shows generation complete header when multiple stages completed', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
      { label: 'Architecture document', filePath: '/tmp/docs/arch.md' },
    ];
    const { output, unmount } = renderScreen({ status: 'success', completedStages: completed });
    unmount();
    expect(output).toContain('Generation Complete');
  });

  it('does not print document content in architecture or plan completed stages', () => {
    const completed: CompletedStage[] = [
      { label: 'Project specification', filePath: '/tmp/docs/spec.md' },
    ];
    const { output, unmount } = renderScreen({
      status: 'generating',
      currentStage: 'architecture',
      completedStages: completed,
    });
    unmount();
    expect(output).not.toContain('## System Components');
    expect(output).not.toContain('## Phase 1');
  });
});
