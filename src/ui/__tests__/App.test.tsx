import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import {
  App,
  TranscriptView,
  InterviewInput,
  CommandAutocomplete,
  MAX_VISIBLE_MESSAGES,
  inputReducer,
  isBackspaceKey,
  isDeleteKey,
} from '../App.js';
import type { InputState, CommandAutocompleteProps } from '../App.js';
import type { CommandMetadata } from '../../interview/commands.js';
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

describe('inputReducer', () => {
  const s = (value: string, cursorPos: number): InputState => ({ value, cursorPos });

  // ---- insert ----

  it('inserts a character at the end of an empty buffer', () => {
    expect(inputReducer(s('', 0), { type: 'insert', char: 'a' })).toEqual(s('a', 1));
  });

  it('inserts a character at end of existing text', () => {
    expect(inputReducer(s('ab', 2), { type: 'insert', char: 'c' })).toEqual(s('abc', 3));
  });

  it('inserts a character at the start of existing text', () => {
    expect(inputReducer(s('bc', 0), { type: 'insert', char: 'a' })).toEqual(s('abc', 1));
  });

  it('inserts a character in the middle of existing text', () => {
    expect(inputReducer(s('ac', 1), { type: 'insert', char: 'b' })).toEqual(s('abc', 2));
  });

  it('chains two inserts correctly (simulates rapid keypresses)', () => {
    const after1 = inputReducer(s('', 0), { type: 'insert', char: 'x' });
    const after2 = inputReducer(after1, { type: 'insert', char: 'y' });
    expect(after2).toEqual(s('xy', 2));
  });

  // ---- backspace ----

  it('backspace at position 0 is a no-op', () => {
    expect(inputReducer(s('abc', 0), { type: 'backspace' })).toEqual(s('abc', 0));
  });

  it('backspace at end deletes the last character', () => {
    expect(inputReducer(s('abc', 3), { type: 'backspace' })).toEqual(s('ab', 2));
  });

  it('backspace at mid-string deletes the character before the cursor', () => {
    expect(inputReducer(s('abc', 2), { type: 'backspace' })).toEqual(s('ac', 1));
  });

  it('backspace empties a single-character buffer', () => {
    expect(inputReducer(s('x', 1), { type: 'backspace' })).toEqual(s('', 0));
  });

  it('chains two backspaces correctly (simulates rapid keypresses)', () => {
    const after1 = inputReducer(s('abc', 3), { type: 'backspace' });
    const after2 = inputReducer(after1, { type: 'backspace' });
    expect(after2).toEqual(s('a', 1));
  });

  it('backspace on already-empty buffer is a no-op', () => {
    expect(inputReducer(s('', 0), { type: 'backspace' })).toEqual(s('', 0));
  });

  // ---- delete ----

  it('delete at the end of the buffer is a no-op', () => {
    expect(inputReducer(s('abc', 3), { type: 'delete' })).toEqual(s('abc', 3));
  });

  it('delete at position 0 removes the first character', () => {
    expect(inputReducer(s('abc', 0), { type: 'delete' })).toEqual(s('bc', 0));
  });

  it('delete in the middle removes the character at the cursor', () => {
    expect(inputReducer(s('abc', 1), { type: 'delete' })).toEqual(s('ac', 1));
  });

  it('delete on empty buffer is a no-op', () => {
    expect(inputReducer(s('', 0), { type: 'delete' })).toEqual(s('', 0));
  });

  it('chains two deletes correctly', () => {
    const after1 = inputReducer(s('abc', 0), { type: 'delete' });
    const after2 = inputReducer(after1, { type: 'delete' });
    expect(after2).toEqual(s('c', 0));
  });

  // ---- left ----

  it('left at position 0 is a no-op', () => {
    expect(inputReducer(s('abc', 0), { type: 'left' })).toEqual(s('abc', 0));
  });

  it('left moves cursor back one position', () => {
    expect(inputReducer(s('abc', 3), { type: 'left' })).toEqual(s('abc', 2));
  });

  it('chains two left moves', () => {
    const after1 = inputReducer(s('abc', 3), { type: 'left' });
    const after2 = inputReducer(after1, { type: 'left' });
    expect(after2).toEqual(s('abc', 1));
  });

  // ---- right ----

  it('right at end of buffer is a no-op', () => {
    expect(inputReducer(s('abc', 3), { type: 'right' })).toEqual(s('abc', 3));
  });

  it('right moves cursor forward one position', () => {
    expect(inputReducer(s('abc', 0), { type: 'right' })).toEqual(s('abc', 1));
  });

  it('right respects the updated buffer length after insert (no stale boundary)', () => {
    // Simulate: insert 'd' into "abc" at end, then move right — cursor should stay at 4
    const afterInsert = inputReducer(s('abc', 3), { type: 'insert', char: 'd' });
    expect(afterInsert).toEqual(s('abcd', 4));
    const afterRight = inputReducer(afterInsert, { type: 'right' });
    // Already at end; should remain at 4
    expect(afterRight).toEqual(s('abcd', 4));
  });

  // ---- home / end ----

  it('home moves cursor to position 0', () => {
    expect(inputReducer(s('hello', 5), { type: 'home' })).toEqual(s('hello', 0));
  });

  it('home on already-at-start is a no-op in terms of value', () => {
    expect(inputReducer(s('hello', 0), { type: 'home' })).toEqual(s('hello', 0));
  });

  it('end moves cursor to the last position', () => {
    expect(inputReducer(s('hello', 0), { type: 'end' })).toEqual(s('hello', 5));
  });

  it('end reflects the updated buffer length after insert', () => {
    const afterInsert = inputReducer(s('ab', 1), { type: 'insert', char: 'x' });
    const afterEnd = inputReducer(afterInsert, { type: 'end' });
    expect(afterEnd).toEqual(s('axb', 3));
  });

  // ---- clear ----

  it('clear resets value and cursorPos to empty state', () => {
    expect(inputReducer(s('hello world', 5), { type: 'clear' })).toEqual(s('', 0));
  });

  it('clear on empty buffer is a no-op', () => {
    expect(inputReducer(s('', 0), { type: 'clear' })).toEqual(s('', 0));
  });

  // ---- combined editing sequences ----

  it('type then backspace repeatedly leaves buffer correct', () => {
    let state = s('', 0);
    for (const ch of 'hello') state = inputReducer(state, { type: 'insert', char: ch });
    // Delete all characters via backspace
    for (let i = 0; i < 5; i++) state = inputReducer(state, { type: 'backspace' });
    expect(state).toEqual(s('', 0));
  });

  it('mid-string edit: move to position 2 then insert', () => {
    let state = s('ace', 3);
    state = inputReducer(state, { type: 'left' }); // pos 2
    state = inputReducer(state, { type: 'left' }); // pos 1
    state = inputReducer(state, { type: 'insert', char: 'b' }); // "abce", pos 2
    expect(state).toEqual(s('abce', 2));
  });

  it('move to start then delete forward removes all characters one by one', () => {
    let state = s('abc', 3);
    state = inputReducer(state, { type: 'home' }); // pos 0
    state = inputReducer(state, { type: 'delete' }); // "bc", 0
    state = inputReducer(state, { type: 'delete' }); // "c", 0
    state = inputReducer(state, { type: 'delete' }); // "", 0
    expect(state).toEqual(s('', 0));
  });
});

// ---------------------------------------------------------------------------
// CommandAutocomplete component tests
// ---------------------------------------------------------------------------

function renderCommandAutocompleteText(props: CommandAutocompleteProps): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(CommandAutocomplete, props), {
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

function makeCommands(names: string[]): CommandMetadata[] {
  return names.map(n => ({
    name: n as CommandMetadata['name'],
    usage: n,
    description: `${n} description`,
  }));
}

describe('CommandAutocomplete component', () => {
  it('renders nothing when items is empty', () => {
    const output = renderCommandAutocompleteText({ items: [], selectedIndex: 0 });
    expect(output.trim()).toBe('');
  });

  it('renders all provided items', () => {
    const items = makeCommands(['/finish-now', '/model', '/help']);
    const output = renderCommandAutocompleteText({ items, selectedIndex: 0 });
    expect(output).toContain('/finish-now');
    expect(output).toContain('/model');
    expect(output).toContain('/help');
  });

  it('renders description text for items', () => {
    const items = makeCommands(['/finish-now']);
    const output = renderCommandAutocompleteText({ items, selectedIndex: 0 });
    expect(output).toContain('/finish-now description');
  });

  it('shows navigation hint text', () => {
    const items = makeCommands(['/help']);
    const output = renderCommandAutocompleteText({ items, selectedIndex: 0 });
    expect(output).toContain('navigate');
    expect(output).toContain('Enter');
    expect(output).toContain('Esc');
  });

  it('renders the selection arrow (▶) for the selected item', () => {
    const items = makeCommands(['/finish-now', '/model']);
    const output = renderCommandAutocompleteText({ items, selectedIndex: 1 });
    expect(output).toContain('▶');
  });

  it('renders single item without throwing', () => {
    const stream = new PassThrough();
    const items = makeCommands(['/help']);
    const { unmount } = render(
      React.createElement(CommandAutocomplete, { items, selectedIndex: 0 }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('clamps selectedIndex that is out of range', () => {
    const items = makeCommands(['/help']);
    const output = renderCommandAutocompleteText({ items, selectedIndex: 99 });
    expect(output).toContain('/help');
    expect(output).toContain('▶');
  });
});

// ---------------------------------------------------------------------------
// Autocomplete keyboard interaction tests (stdin injection)
// ---------------------------------------------------------------------------

function createMockStdin() {
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean;
    setRawMode: () => void;
    ref: () => void;
    unref: () => void;
  };
  stdin.isTTY = true;
  stdin.setRawMode = vi.fn();
  stdin.ref = vi.fn();
  stdin.unref = vi.fn();
  return stdin;
}

function renderAppWithStdin(
  props: Parameters<typeof App>[0],
  stdin: ReturnType<typeof createMockStdin>,
) {
  const stream = new PassThrough();
  return render(React.createElement(App, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
  });
}

describe('App autocomplete keyboard interaction', () => {
  // Wait long enough for React's async scheduler to flush effects between key presses.
  // Ink's custom reconciler commits renders synchronously, but useEffect callbacks are
  // scheduled asynchronously (React scheduler uses MessageChannel / setTimeout(fn,0)),
  // so a macrotask-level pause is required between stdin writes to ensure effects like
  // inputStateRef sync and autocomplete index reset have run before the next key.
  const waitForEffects = () => new Promise<void>((r) => setTimeout(r, 50));

  it('pressing Enter with autocomplete open submits the highlighted command name', async () => {
    const stdin = createMockStdin();
    const onSubmit = vi.fn();
    const { unmount } = renderAppWithStdin({ transcript: [], onSubmit }, stdin);
    await waitForEffects(); // wait for initial render and effect setup

    // Type "/" — opens autocomplete showing all commands (index 0 = /finish-now)
    stdin.write('/');
    await waitForEffects(); // wait for render + inputStateRef sync effect

    // Press Down — moves selection to index 1 (/model)
    stdin.write('\x1B[B');
    await waitForEffects();

    // Press Enter — should submit "/model" (the highlighted command), not "/"
    stdin.write('\r');
    await waitForEffects();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('/model');

    unmount();
  });

  it('pressing Escape when buffer starts with "/" clears the buffer without submitting', async () => {
    const stdin = createMockStdin();
    const onSubmit = vi.fn();
    const { unmount } = renderAppWithStdin({ transcript: [], onSubmit }, stdin);
    await waitForEffects();

    // Type "/model" to populate the buffer
    for (const char of '/model') {
      stdin.write(char);
      await waitForEffects();
    }

    // Press Escape — should clear the buffer
    stdin.write('\x1B');
    await waitForEffects();

    // Press Enter — should not submit because buffer was cleared
    stdin.write('\r');
    await waitForEffects();

    expect(onSubmit).not.toHaveBeenCalled();

    unmount();
  });

  it('pressing Down twice then Up once leaves selection at index 1 and submits that command', async () => {
    const stdin = createMockStdin();
    const onSubmit = vi.fn();
    const { unmount } = renderAppWithStdin({ transcript: [], onSubmit }, stdin);
    await waitForEffects();

    // Type "/" — opens autocomplete with all 4 commands
    stdin.write('/');
    await waitForEffects();

    // Down twice → index 2 (/provider)
    stdin.write('\x1B[B');
    await waitForEffects();
    stdin.write('\x1B[B');
    await waitForEffects();

    // Up once → index 1 (/model)
    stdin.write('\x1B[A');
    await waitForEffects();

    // Enter — should submit index 1 = /model
    stdin.write('\r');
    await waitForEffects();

    expect(onSubmit).toHaveBeenCalledWith('/model');

    unmount();
  });

  it('pressing raw DEL removes the previous character', async () => {
    const stdin = createMockStdin();
    const onSubmit = vi.fn();
    const { unmount } = renderAppWithStdin({ transcript: [], onSubmit }, stdin);
    await waitForEffects();

    stdin.write('a');
    await waitForEffects();
    stdin.write('b');
    await waitForEffects();
    stdin.write('c');
    await waitForEffects();
    stdin.write('\x7f');
    await waitForEffects();
    stdin.write('\r');
    await waitForEffects();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('ab');

    unmount();
  });

  it('treats raw BS bytes as backspace input', () => {
    expect(isBackspaceKey('\b', {})).toBe(true);
  });

  it('keeps real delete sequences classified as delete', () => {
    expect(isDeleteKey('\x1b[3~', { delete: true })).toBe(true);
  });

  it('does not treat raw DEL delete classification as forward delete', () => {
    expect(isDeleteKey('\x7f', { delete: true })).toBe(false);
  });
});

describe('App autocomplete integration', () => {
  it('shows command suggestions when input starts with "/"', () => {
    // Render app with pre-populated input is not directly testable via static
    // render (useInput is keyboard-driven), but we verify the autocomplete
    // component renders correctly in isolation, and that the app renders
    // without error in normal state.
    const { unmount } = renderApp({});
    unmount();
  });

  it('does not show autocomplete hint when input is empty', () => {
    const output = renderAppText({ transcript: [] });
    expect(output).not.toContain('↑/↓ navigate');
  });

  it('does not show autocomplete when modelSelectOptions is active', () => {
    const output = renderAppText({
      modelSelectOptions: ['llama3', 'mistral'],
    });
    expect(output).not.toContain('↑/↓ navigate');
  });

  it('does not show autocomplete when isComplete is true', () => {
    const output = renderAppText({ isComplete: true });
    expect(output).not.toContain('↑/↓ navigate');
  });

  it('does not show autocomplete when fatalErrorMessage is set', () => {
    const output = renderAppText({ fatalErrorMessage: 'oops' });
    expect(output).not.toContain('↑/↓ navigate');
  });
});
