import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { App, TranscriptView, InterviewInput, MAX_VISIBLE_MESSAGES } from '../App.js';
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

function renderTranscriptViewText(props: Parameters<typeof TranscriptView>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(TranscriptView, props), {
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

function renderInterviewInputText(props: Parameters<typeof InterviewInput>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(InterviewInput, props), {
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

function makeMessages(count: number): InterviewMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'assistant' : 'user') as InterviewMessage['role'],
    content: `Message ${i + 1}`,
    timestamp: `2024-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
  }));
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

  it('renders the most recent messages from a long transcript', () => {
    const transcript = makeMessages(MAX_VISIBLE_MESSAGES + 5);
    const output = renderAppText({ transcript });
    // The last message should always be visible
    expect(output).toContain(`Message ${MAX_VISIBLE_MESSAGES + 5}`);
  });

  it('shows earlier-messages indicator when transcript exceeds MAX_VISIBLE_MESSAGES', () => {
    const transcript = makeMessages(MAX_VISIBLE_MESSAGES + 3);
    const output = renderAppText({ transcript });
    expect(output).toContain('earlier message');
  });

  it('does not show earlier-messages indicator for short transcripts', () => {
    const transcript = makeMessages(MAX_VISIBLE_MESSAGES - 2);
    const output = renderAppText({ transcript });
    expect(output).not.toContain('earlier message');
  });

  it('shows completed state text when isComplete is true', () => {
    const output = renderAppText({ isComplete: true });
    expect(output).toContain('Interview complete');
  });

  it('shows fatal error text when fatalErrorMessage is set', () => {
    const output = renderAppText({ fatalErrorMessage: 'Provider crashed' });
    expect(output).toContain('Provider crashed');
  });
});

describe('TranscriptView component', () => {
  const makeProps = (
    count: number,
    scrollOffset = 0,
    isThinking = false,
  ): Parameters<typeof TranscriptView>[0] => ({
    transcript: makeMessages(count),
    isThinking,
    spinnerFrame: 0,
    scrollOffset,
  });

  it('renders without throwing for empty transcript', () => {
    const stream = new PassThrough();
    const { unmount } = render(React.createElement(TranscriptView, makeProps(0)), {
      stdout: stream as unknown as NodeJS.WriteStream,
    });
    unmount();
  });

  it('renders all messages when count is within MAX_VISIBLE_MESSAGES', () => {
    const output = renderTranscriptViewText(makeProps(5));
    expect(output).toContain('Message 1');
    expect(output).toContain('Message 5');
    expect(output).not.toContain('earlier message');
  });

  it('shows last MAX_VISIBLE_MESSAGES messages at scrollOffset 0', () => {
    // Use a count where the first visible message number cannot appear as a
    // substring in any of the later message numbers (avoids "Message 1" matching
    // "Message 11", "Message 12", etc.).
    const count = MAX_VISIBLE_MESSAGES + 4; // 14 messages; messages 1-4 hidden
    const output = renderTranscriptViewText(makeProps(count));
    // Most recent message should be visible
    expect(output).toContain(`Message ${count}`);
    // The very first messages (1–4) should be absent. We check message 4
    // because "Message 4" is not a substring of any of the visible messages 5-14.
    // "Message 4" is not a substring of any visible message (5–14), so this
    // confirms the first hidden messages are not rendered.
    expect(output).not.toContain('Message 4');
  });

  it('shows earlier-messages indicator when history is truncated', () => {
    const output = renderTranscriptViewText(makeProps(MAX_VISIBLE_MESSAGES + 2));
    expect(output).toContain('earlier message');
    expect(output).toContain('PgUp');
  });

  it('shows older messages when scrollOffset is non-zero', () => {
    const count = MAX_VISIBLE_MESSAGES + 5;
    // Scroll back by count so we see the beginning
    const output = renderTranscriptViewText(makeProps(count, count));
    expect(output).toContain('Message 1');
  });

  it('shows newer-messages indicator when scrolled back', () => {
    const count = MAX_VISIBLE_MESSAGES + 5;
    const output = renderTranscriptViewText(makeProps(count, 3));
    expect(output).toContain('newer message');
    expect(output).toContain('PgDn');
  });

  it('does not show newer-messages indicator at scrollOffset 0', () => {
    const output = renderTranscriptViewText(makeProps(MAX_VISIBLE_MESSAGES + 3, 0));
    expect(output).not.toContain('newer message');
  });

  it('clamps scrollOffset to avoid going past the beginning', () => {
    // scrollOffset far beyond the message count should still render without error
    const output = renderTranscriptViewText(makeProps(5, 999));
    // Should show Message 1 since we're at the very top
    expect(output).toContain('Message 1');
  });

  it('does not show thinking indicator when scrolled back', () => {
    const count = MAX_VISIBLE_MESSAGES + 5;
    const output = renderTranscriptViewText(makeProps(count, 5, true));
    // Thinking indicator should not appear when not at the bottom
    expect(output).not.toContain('thinking');
  });

  it('shows thinking indicator when at scrollOffset 0 and isThinking is true', () => {
    const output = renderTranscriptViewText(makeProps(3, 0, true));
    expect(output).toContain('thinking');
  });
});

describe('InterviewInput component', () => {
  it('renders without throwing', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(InterviewInput, { value: '', cursorPos: 0, isThinking: false }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('shows hint text when input is empty and not thinking', () => {
    const output = renderInterviewInputText({ value: '', cursorPos: 0, isThinking: false });
    expect(output).toContain('Type a message');
    expect(output).toContain('/help');
  });

  it('does not show hint text when input has content', () => {
    const output = renderInterviewInputText({
      value: 'hello',
      cursorPos: 5,
      isThinking: false,
    });
    expect(output).not.toContain('Type a message');
  });

  it('does not show hint text when thinking', () => {
    const output = renderInterviewInputText({ value: '', cursorPos: 0, isThinking: true });
    expect(output).not.toContain('Type a message');
  });

  it('renders input value in output', () => {
    const output = renderInterviewInputText({
      value: 'hello world',
      cursorPos: 11,
      isThinking: false,
    });
    // The value characters should appear in the output
    expect(output).toContain('hello world');
  });

  it('renders block cursor when cursorPos is at end of value', () => {
    const output = renderInterviewInputText({
      value: 'abc',
      cursorPos: 3,
      isThinking: false,
    });
    expect(output).toContain('█');
  });

  it('renders block cursor when value is empty', () => {
    const output = renderInterviewInputText({ value: '', cursorPos: 0, isThinking: false });
    expect(output).toContain('█');
  });

  it('renders content before and after cursor when cursor is mid-string', () => {
    const output = renderInterviewInputText({
      value: 'hello',
      cursorPos: 2,
      isThinking: false,
    });
    // Should contain 'he' before cursor and 'lo' after
    expect(output).toContain('he');
    expect(output).toContain('lo');
  });

  it('does not show block cursor when thinking', () => {
    const output = renderInterviewInputText({
      value: 'partial',
      cursorPos: 7,
      isThinking: true,
    });
    expect(output).not.toContain('█');
  });
});
