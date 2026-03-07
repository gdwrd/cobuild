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

function createInputStream(): NodeJS.ReadStream {
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream & {
    setRawMode: (mode: boolean) => typeof stdin;
  };
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  return stdin;
}

function renderPrompt(question: string, onAnswer: () => void) {
  const stream = new PassThrough();
  return render(
    React.createElement(YesNoPrompt, { question, onAnswer }),
    {
      stdout: stream as unknown as NodeJS.WriteStream,
      stdin: createInputStream(),
    },
  );
}

describe('YesNoPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the default prompt without throwing', () => {
    const onAnswer = vi.fn();
    const { unmount } = renderPrompt('Generate architecture document?', onAnswer);
    unmount();
  });

  it('renders with a custom question', () => {
    const onAnswer = vi.fn();
    const { unmount } = renderPrompt('Generate high-level development plan?', onAnswer);
    unmount();
  });

  it('does not call onAnswer on initial render', () => {
    const onAnswer = vi.fn();
    const { unmount } = renderPrompt('Generate architecture document?', onAnswer);
    expect(onAnswer).not.toHaveBeenCalled();
    unmount();
  });

  it('renders without throwing when question is empty string', () => {
    const onAnswer = vi.fn();
    const { unmount } = renderPrompt('', onAnswer);
    unmount();
  });
});
