import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { App } from '../App.js';
import type { InterviewMessage } from '../../session/session.js';

function renderApp(props: Parameters<typeof App>[0]): { output: string; unmount: () => void } {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(App, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });

  // Flush synchronous output
  stream.end();
  const raw = Buffer.concat(chunks).toString();
  // Strip ANSI escape codes for easier assertion
  /* eslint-disable no-control-regex */
  const stripped1 = raw.replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '');
  const output = stripped1.replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  /* eslint-enable no-control-regex */

  return { output, unmount };
}

describe('App component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing given valid props', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(App, { sessionId: 'test-session', version: '0.1.0' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing with minimal sessionId', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(App, { sessionId: 'x', version: '1.0.0' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders transcript assistant messages without throwing', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'What would you like to build?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ];
    const { unmount } = renderApp({ sessionId: 'abc123', version: '0.1.0', transcript });
    unmount();
  });

  it('renders transcript user messages without throwing', () => {
    const transcript: InterviewMessage[] = [
      { role: 'user', content: 'A todo app', timestamp: '2024-01-01T00:00:01.000Z' },
    ];
    const { unmount } = renderApp({ sessionId: 'abc123', version: '0.1.0', transcript });
    unmount();
  });

  it('renders with mixed transcript without throwing', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'What would you like to build?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
      { role: 'user', content: 'A todo app', timestamp: '2024-01-01T00:00:01.000Z' },
      {
        role: 'assistant',
        content: 'Who are the target users?',
        timestamp: '2024-01-01T00:00:02.000Z',
      },
    ];
    const { unmount } = renderApp({ sessionId: 'abc123', version: '0.1.0', transcript });
    unmount();
  });

  it('renders thinking state without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      isThinking: true,
    });
    unmount();
  });

  it('renders non-thinking state without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      isThinking: false,
    });
    unmount();
  });

  it('renders with error message without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      errorMessage: 'Connection refused',
    });
    unmount();
  });

  it('renders with null error message without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      errorMessage: null,
    });
    unmount();
  });

  it('renders with empty transcript without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      transcript: [],
    });
    unmount();
  });

  it('renders with onSubmit callback without throwing', () => {
    const onSubmit = vi.fn();
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      onSubmit,
    });
    unmount();
  });

  it('renders session id prefix in output', () => {
    const { output, unmount } = renderApp({ sessionId: 'abcdefgh-rest', version: '0.1.0' });
    unmount();
    expect(output).toContain('abcdefgh');
  });

  it('renders version in output', () => {
    const { output, unmount } = renderApp({ sessionId: 'abc123', version: '0.1.0' });
    unmount();
    expect(output).toContain('0.1.0');
  });
});
