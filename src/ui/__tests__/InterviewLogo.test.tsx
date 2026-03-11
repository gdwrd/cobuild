import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { InterviewLogo, LOGO_LINES, LOGO_TAGLINE } from '../InterviewLogo.js';
import { App } from '../App.js';
import type { InterviewMessage } from '../../session/session.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function renderText(element: React.ReactElement): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(element, {
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

describe('InterviewLogo component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing', () => {
    const stream = new PassThrough();
    const { unmount } = render(React.createElement(InterviewLogo), {
      stdout: stream as unknown as NodeJS.WriteStream,
    });
    unmount();
  });

  it('renders all four logo lines', () => {
    const text = renderText(React.createElement(InterviewLogo));
    for (const line of LOGO_LINES) {
      // Check a distinctive substring from each line
      expect(text).toContain(line.trim().slice(0, 8));
    }
  });

  it('renders the tagline with gear symbol', () => {
    const text = renderText(React.createElement(InterviewLogo));
    expect(text).toContain('build software with AI');
    expect(text).toContain('\u2699');
  });

  it('LOGO_LINES constant has exactly 4 entries', () => {
    expect(LOGO_LINES).toHaveLength(4);
  });

  it('each logo line fits within 80 characters', () => {
    for (const line of LOGO_LINES) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('LOGO_TAGLINE includes build with AI text', () => {
    expect(LOGO_TAGLINE).toContain('build software with AI');
  });
});

describe('App component logo visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the logo on the welcome/empty state (no transcript)', () => {
    const text = renderText(React.createElement(App, { transcript: [] }));
    expect(text).toContain('build software with AI');
  });

  it('shows the logo when transcript prop is omitted', () => {
    const text = renderText(React.createElement(App, {}));
    expect(text).toContain('build software with AI');
  });

  it('does not show the logo when transcript has messages', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'Hello, what would you like to build?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ];
    const text = renderText(React.createElement(App, { transcript }));
    expect(text).not.toContain('build software with AI');
    // Transcript content should still be visible
    expect(text).toContain('Hello, what would you like to build?');
  });

  it('does not show the logo when isComplete is true', () => {
    const text = renderText(React.createElement(App, { transcript: [], isComplete: true }));
    expect(text).not.toContain('build software with AI');
  });

  it('does not show the logo when there is a fatalErrorMessage', () => {
    const text = renderText(
      React.createElement(App, { transcript: [], fatalErrorMessage: 'Something went wrong' }),
    );
    expect(text).not.toContain('build software with AI');
  });

  it('does not show the logo when model selection is active', () => {
    const text = renderText(
      React.createElement(App, {
        transcript: [],
        modelSelectOptions: ['llama3.2', 'mistral'],
      }),
    );
    expect(text).not.toContain('build software with AI');
  });

  it('does not show the logo when isThinking is true', () => {
    const text = renderText(React.createElement(App, { transcript: [], isThinking: true }));
    expect(text).not.toContain('build software with AI');
  });
});
