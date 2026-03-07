import { describe, it, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { App } from '../App.js';
import type { InterviewMessage } from '../../session/session.js';

function renderApp(props: Parameters<typeof App>[0]) {
  const stream = new PassThrough();
  return render(React.createElement(App, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
}

describe('App component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing given valid props', () => {
    const { unmount } = renderApp({ sessionId: 'test-session', version: '0.1.0' });
    unmount();
  });

  it('renders without throwing with minimal sessionId', () => {
    const { unmount } = renderApp({ sessionId: 'x', version: '1.0.0' });
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

  it('renders with fatal error without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      fatalErrorMessage: 'Pipeline crashed',
    });
    unmount();
  });

  it('renders completed state without throwing', () => {
    const { unmount } = renderApp({
      sessionId: 'abc123',
      version: '0.1.0',
      isComplete: true,
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
});
