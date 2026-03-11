import { describe, it, vi, beforeEach, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { InterviewLogo, LOGO_LINES, LOGO_TAGLINE } from '../InterviewLogo.js';
import { App } from '../App.js';
import { GenerationScreen } from '../GenerationScreen.js';
import { RestoredSession } from '../RestoredSession.js';
import { ErrorScreen } from '../ErrorScreen.js';
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

  it('renders transcript content in correct order: logo first then messages', () => {
    // When logo is visible (empty transcript), it appears before input area
    const welcomeText = renderText(React.createElement(App, { transcript: [] }));
    const logoPos = welcomeText.indexOf('build software with AI');
    const cursorPos = welcomeText.indexOf('█');
    expect(logoPos).toBeGreaterThanOrEqual(0);
    expect(cursorPos).toBeGreaterThan(logoPos);
  });

  it('transcript content appears without any logo content mixed in', () => {
    const transcript: InterviewMessage[] = [
      {
        role: 'assistant',
        content: 'What project would you like to build today?',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
      {
        role: 'user',
        content: 'A calendar app',
        timestamp: '2024-01-01T00:00:01.000Z',
      },
    ];
    const text = renderText(React.createElement(App, { transcript }));
    expect(text).toContain('What project would you like to build today?');
    expect(text).toContain('A calendar app');
    // Logo must not appear at all
    expect(text).not.toContain('build software with AI');
    for (const line of LOGO_LINES) {
      expect(text).not.toContain(line.trim().slice(0, 12));
    }
  });
});

describe('ASCII art regression guard', () => {
  it('LOGO_LINES contains exactly 4 lines matching the cobuild ASCII art', () => {
    // Lock in the exact ASCII art content to catch accidental modifications.
    // Update these expected values intentionally when the branding is changed.
    expect(LOGO_LINES).toHaveLength(4);
    expect(LOGO_LINES[0]).toBe('  ___  ___  ___  _   _ ___ _    ___');
    expect(LOGO_LINES[1]).toBe(' / __|/ _ \\| _ )| | | |_ _|| |  |   \\');
    expect(LOGO_LINES[2]).toBe('| (__ | (_) | _ \\| |_| || | | |__| |) |');
    expect(LOGO_LINES[3]).toBe(' \\___| \\___/|___/ \\___/|___||____|___/');
  });

  it('LOGO_LINES[0] starts with the expected opening characters', () => {
    expect(LOGO_LINES[0].trimStart()).toMatch(/^___/);
  });

  it('LOGO_LINES[3] (bottom row) ends with the closing slash pattern', () => {
    expect(LOGO_LINES[3]).toContain('___/');
  });

  it('LOGO_TAGLINE starts with gear symbol and ends with gear symbol', () => {
    const trimmed = LOGO_TAGLINE.trim();
    expect(trimmed.startsWith('\u2699')).toBe(true);
    expect(trimmed.endsWith('\u2699')).toBe(true);
  });

  it('LOGO_TAGLINE contains the expected tagline text', () => {
    expect(LOGO_TAGLINE).toContain('build software with AI');
  });
});

describe('Logo absent on non-interview screens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GenerationScreen does not render the logo tagline', () => {
    const text = renderText(React.createElement(GenerationScreen, { status: 'generating' }));
    expect(text).not.toContain('build software with AI');
  });

  it('GenerationScreen does not render any logo line content', () => {
    const text = renderText(React.createElement(GenerationScreen, { status: 'success', filePath: '/tmp/spec.md' }));
    for (const line of LOGO_LINES) {
      expect(text).not.toContain(line.trim().slice(0, 12));
    }
  });

  it('GenerationScreen in error state does not render the logo', () => {
    const text = renderText(
      React.createElement(GenerationScreen, { status: 'error', errorMessage: 'failed' }),
    );
    expect(text).not.toContain('build software with AI');
  });

  it('RestoredSession does not render the logo tagline', () => {
    const text = renderText(
      React.createElement(RestoredSession, {
        sessionId: 'abc-123-def-456',
        onContinue: vi.fn(),
      }),
    );
    expect(text).not.toContain('build software with AI');
  });

  it('RestoredSession does not render any logo line content', () => {
    const text = renderText(
      React.createElement(RestoredSession, {
        sessionId: 'abc-123-def-456',
        stage: 'interview',
        onContinue: vi.fn(),
      }),
    );
    for (const line of LOGO_LINES) {
      expect(text).not.toContain(line.trim().slice(0, 12));
    }
  });

  it('ErrorScreen does not render the logo tagline', () => {
    const text = renderText(
      React.createElement(ErrorScreen, { message: 'Something went wrong' }),
    );
    expect(text).not.toContain('build software with AI');
  });

  it('ErrorScreen does not render any logo line content', () => {
    const text = renderText(
      React.createElement(ErrorScreen, { message: 'Fatal error occurred' }),
    );
    for (const line of LOGO_LINES) {
      expect(text).not.toContain(line.trim().slice(0, 12));
    }
  });
});
