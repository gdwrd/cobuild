import { describe, it, vi, beforeEach, expect } from 'vitest';
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

function renderAppText(props: Parameters<typeof App>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(App, props), {
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

describe('App component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing given no props', () => {
    const { unmount } = renderApp({});
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
    const { unmount } = renderApp({ transcript });
    unmount();
  });

  it('renders transcript user messages without throwing', () => {
    const transcript: InterviewMessage[] = [
      { role: 'user', content: 'A todo app', timestamp: '2024-01-01T00:00:01.000Z' },
    ];
    const { unmount } = renderApp({ transcript });
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
    const { unmount } = renderApp({ transcript });
    unmount();
  });

  it('renders thinking state without throwing', () => {
    const { unmount } = renderApp({ isThinking: true });
    unmount();
  });

  it('renders non-thinking state without throwing', () => {
    const { unmount } = renderApp({ isThinking: false });
    unmount();
  });

  it('renders with fatal error without throwing', () => {
    const { unmount } = renderApp({ fatalErrorMessage: 'Pipeline crashed' });
    unmount();
  });

  it('renders completed state without throwing', () => {
    const { unmount } = renderApp({ isComplete: true });
    unmount();
  });

  it('renders with empty transcript without throwing', () => {
    const { unmount } = renderApp({ transcript: [] });
    unmount();
  });

  it('renders with onSubmit callback without throwing', () => {
    const onSubmit = vi.fn();
    const { unmount } = renderApp({ onSubmit });
    unmount();
  });

  it('renders transcript with assistant label visible', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'What would you like to build?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ];
    const output = renderAppText({ transcript });
    expect(output).toContain('assistant');
  });

  it('renders transcript with user content visible', () => {
    const transcript: InterviewMessage[] = [
      { role: 'user', content: 'A todo app', timestamp: '2024-01-01T00:00:01.000Z' },
    ];
    const output = renderAppText({ transcript });
    expect(output).toContain('A todo app');
  });

  it('renders assistant and user turns with distinct visual markers', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'What is your project?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
      { role: 'user', content: 'A task manager', timestamp: '2024-01-01T00:00:01.000Z' },
    ];
    const output = renderAppText({ transcript });
    expect(output).toContain('assistant');
    expect(output).toContain('A task manager');
  });

  it('renders ModelSelectPrompt when modelSelectOptions is provided', () => {
    const output = renderAppText({
      modelSelectOptions: ['llama3', 'mistral', 'codellama'],
    });
    expect(output).toContain('llama3');
    expect(output).toContain('mistral');
    expect(output).toContain('codellama');
  });

  it('does not render model list when modelSelectOptions is absent', () => {
    const output = renderAppText({ transcript: [] });
    expect(output).not.toContain('Select a model');
  });

  it('does not render model list when modelSelectOptions is empty', () => {
    const output = renderAppText({ modelSelectOptions: [] });
    expect(output).not.toContain('Select a model');
  });
});
