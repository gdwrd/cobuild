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

function renderToText(question: string, onAnswer: () => void): { output: string; unmount: () => void } {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(
    React.createElement(YesNoPrompt, { question, onAnswer }),
    { stdout: stream as unknown as NodeJS.WriteStream },
  );
  stream.end();
  const raw = Buffer.concat(chunks).toString();
  /* eslint-disable no-control-regex */
  const output = raw.replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '').replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  /* eslint-enable no-control-regex */
  return { output, unmount };
}

describe('YesNoPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the question text', () => {
    const onAnswer = vi.fn();
    const { output, unmount } = renderToText('Generate architecture document?', onAnswer);
    expect(output).toContain('Generate architecture document?');
    unmount();
  });

  it('renders with a custom question', () => {
    const onAnswer = vi.fn();
    const { output, unmount } = renderToText('Generate high-level development plan?', onAnswer);
    expect(output).toContain('Generate high-level development plan?');
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
