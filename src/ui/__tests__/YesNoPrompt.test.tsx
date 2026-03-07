import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  }),
}));

import { YesNoPrompt } from '../YesNoPrompt.js';

describe('YesNoPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing', () => {
    const stream = new PassThrough();
    const onAnswer = vi.fn();
    const { unmount } = render(
      React.createElement(YesNoPrompt, {
        question: 'Generate architecture document?',
        onAnswer,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders with a custom question', () => {
    const stream = new PassThrough();
    const onAnswer = vi.fn();
    const { unmount } = render(
      React.createElement(YesNoPrompt, {
        question: 'Generate high-level development plan?',
        onAnswer,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('does not call onAnswer on initial render', () => {
    const stream = new PassThrough();
    const onAnswer = vi.fn();
    const { unmount } = render(
      React.createElement(YesNoPrompt, {
        question: 'Generate architecture document?',
        onAnswer,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    expect(onAnswer).not.toHaveBeenCalled();
    unmount();
  });

  it('renders without throwing when question is empty string', () => {
    const stream = new PassThrough();
    const onAnswer = vi.fn();
    const { unmount } = render(
      React.createElement(YesNoPrompt, {
        question: '',
        onAnswer,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });
});
