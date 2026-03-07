import { describe, it, expect, vi } from 'vitest';
import {
  SPEC_SYSTEM_PROMPT,
  formatTranscriptForPrompt,
  buildSpecMessages,
  getSpecPromptMetadata,
  logSpecPromptMetadata,
} from '../spec-prompt.js';
import type { Session } from '../../session/session.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp/test',
    completed: false,
    stage: 'spec',
    transcript: [],
    ...overrides,
  };
}

describe('SPEC_SYSTEM_PROMPT', () => {
  it('contains required section headings', () => {
    expect(SPEC_SYSTEM_PROMPT).toContain('## Project Overview');
    expect(SPEC_SYSTEM_PROMPT).toContain('## Functional Requirements');
    expect(SPEC_SYSTEM_PROMPT).toContain('## Acceptance Criteria');
  });

  it('instructs model to output only Markdown', () => {
    expect(SPEC_SYSTEM_PROMPT).toContain('Output only the Markdown document');
  });
});

describe('formatTranscriptForPrompt', () => {
  it('returns placeholder for empty transcript', () => {
    const session = makeSession({ transcript: [] });
    expect(formatTranscriptForPrompt(session)).toBe('(no interview transcript available)');
  });

  it('formats user messages with "User:" prefix', () => {
    const session = makeSession({
      transcript: [{ role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(formatTranscriptForPrompt(session)).toContain('User: Hello');
  });

  it('formats assistant messages with "Interviewer:" prefix', () => {
    const session = makeSession({
      transcript: [{ role: 'assistant', content: 'What is your project?', timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    expect(formatTranscriptForPrompt(session)).toContain('Interviewer: What is your project?');
  });

  it('separates turns with blank lines', () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Q1', timestamp: '2024-01-01T00:00:00.000Z' },
        { role: 'user', content: 'A1', timestamp: '2024-01-01T00:00:01.000Z' },
      ],
    });
    const result = formatTranscriptForPrompt(session);
    expect(result).toBe('Interviewer: Q1\n\nUser: A1');
  });
});

describe('buildSpecMessages', () => {
  it('returns exactly two messages', () => {
    const session = makeSession();
    const messages = buildSpecMessages(session);
    expect(messages).toHaveLength(2);
  });

  it('first message is the system prompt', () => {
    const session = makeSession();
    const messages = buildSpecMessages(session);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(SPEC_SYSTEM_PROMPT);
  });

  it('second message is a user message containing the transcript', () => {
    const session = makeSession({
      transcript: [{ role: 'user', content: 'Build a todo app', timestamp: '2024-01-01T00:00:00.000Z' }],
    });
    const messages = buildSpecMessages(session);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Build a todo app');
  });

  it('user message includes write-spec instruction', () => {
    const session = makeSession();
    const messages = buildSpecMessages(session);
    expect(messages[1].content).toContain('Please write the project specification document now.');
  });

  it('uses clean context (only 2 messages, not interview history)', () => {
    const session = makeSession({
      transcript: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `turn ${i}`,
        timestamp: '2024-01-01T00:00:00.000Z',
      })),
    });
    const messages = buildSpecMessages(session);
    // Must use clean context: system + 1 user, not 10 interview messages
    expect(messages).toHaveLength(2);
  });
});

describe('getSpecPromptMetadata', () => {
  it('returns correct message count', () => {
    const session = makeSession();
    const messages = buildSpecMessages(session);
    const meta = getSpecPromptMetadata(session, messages);
    expect(meta.messageCount).toBe(2);
  });

  it('returns transcript turn count', () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Q', timestamp: '2024-01-01T00:00:00.000Z' },
        { role: 'user', content: 'A', timestamp: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const messages = buildSpecMessages(session);
    const meta = getSpecPromptMetadata(session, messages);
    expect(meta.transcriptTurns).toBe(2);
  });

  it('estimates token count greater than zero', () => {
    const session = makeSession();
    const messages = buildSpecMessages(session);
    const meta = getSpecPromptMetadata(session, messages);
    expect(meta.estimatedTokens).toBeGreaterThan(0);
  });
});

describe('logSpecPromptMetadata', () => {
  it('does not throw for a valid session and messages', () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'What is your project?', timestamp: '2024-01-01T00:00:00.000Z' },
        { role: 'user', content: 'A todo app.', timestamp: '2024-01-01T00:00:01.000Z' },
      ],
    });
    const messages = buildSpecMessages(session);
    expect(() => logSpecPromptMetadata(session, messages)).not.toThrow();
  });
});
