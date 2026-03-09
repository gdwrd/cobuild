import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import type { RestoredSessionProps } from '../RestoredSession.js';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
};

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import { RestoredSession } from '../RestoredSession.js';

function renderRestored(props: RestoredSessionProps): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(RestoredSession, props), {
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

describe('RestoredSession', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing', () => {
    const stream = new PassThrough();
    const onContinue = vi.fn();
    const { unmount } = render(
      React.createElement(RestoredSession, {
        sessionId: 'abc-123-def-456',
        onContinue,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders with a different session ID and does not throw', () => {
    const stream = new PassThrough();
    const onContinue = vi.fn();
    const { unmount } = render(
      React.createElement(RestoredSession, {
        sessionId: 'test-session-id',
        onContinue,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders with stage=interview and shows Interview in progress label', () => {
    const output = renderRestored({
      sessionId: 'test-session-id',
      stage: 'interview',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Interview in progress');
  });

  it('renders with stage=dev-plans and shows Dev plan generation label', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'dev-plans',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Dev plan generation');
  });

  it('renders with stage=spec and shows Spec generation label', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'spec',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Spec generation');
  });

  it('renders with stage=architecture and shows Architecture generation label', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'architecture',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Architecture generation');
  });

  it('renders with stage=plan and shows Plan generation label', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'plan',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Plan generation');
  });

  it('renders dev plan progress when provided', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'dev-plans',
      devPlanProgress: { completed: 3, total: 7 },
      onContinue: vi.fn(),
    });
    expect(output).toContain('3');
    expect(output).toContain('7');
    expect(output).toContain('phases complete');
  });

  it('does not render progress line when devPlanProgress is not provided', () => {
    const output = renderRestored({
      sessionId: 'session-xyz',
      stage: 'dev-plans',
      onContinue: vi.fn(),
    });
    expect(output).not.toContain('phases complete');
  });

  it('renders with devPlanProgress and stage without throwing', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(RestoredSession, {
        sessionId: 'log-test-id',
        stage: 'dev-plans',
        devPlanProgress: { completed: 2, total: 5 },
        onContinue: vi.fn(),
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('shows truncated session ID prefix', () => {
    const output = renderRestored({
      sessionId: 'abcdef12-1234-5678-abcd-ef1234567890',
      onContinue: vi.fn(),
    });
    expect(output).toContain('abcdef12');
  });

  it('does not render inline Press Enter hint (footer handles it)', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      onContinue: vi.fn(),
    });
    expect(output).not.toContain('Press Enter to continue');
  });

  it('shows provider name when provided', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      provider: 'ollama',
      onContinue: vi.fn(),
    });
    expect(output).toContain('ollama');
  });

  it('shows model name when provided', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      model: 'llama3',
      onContinue: vi.fn(),
    });
    expect(output).toContain('llama3');
  });

  it('shows provider unavailable warning when providerReady is false', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      provider: 'ollama',
      providerReady: false,
      onContinue: vi.fn(),
    });
    expect(output).toContain('unavailable');
  });

  it('shows resume interview next action for interview stage', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      stage: 'interview',
      providerReady: true,
      onContinue: vi.fn(),
    });
    expect(output).toContain('Resume interview');
  });

  it('shows resume artifact generation next action for spec stage', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      stage: 'spec',
      providerReady: true,
      onContinue: vi.fn(),
    });
    expect(output).toContain('Resume artifact generation');
  });

  it('shows dev plan resume next action with remaining count', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      stage: 'dev-plans',
      devPlanProgress: { completed: 2, total: 5 },
      providerReady: true,
      onContinue: vi.fn(),
    });
    expect(output).toContain('3 phases remaining');
  });

  it('shows provider unavailable next action when provider is not ready', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      stage: 'interview',
      providerReady: false,
      onContinue: vi.fn(),
    });
    expect(output).toContain('Provider unavailable');
  });

  it('does not render an inline cobuild session header (AppShell provides chrome)', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      onContinue: vi.fn(),
    });
    // The AppShell status bar provides the cobuild header; no inline duplicate
    expect(output).not.toContain('cobuild — Session Restored');
  });

  it('shows resuming session content without a standalone title header', () => {
    const output = renderRestored({
      sessionId: 'session-id',
      stage: 'interview',
      onContinue: vi.fn(),
    });
    expect(output).toContain('Resuming previous session');
  });
});
