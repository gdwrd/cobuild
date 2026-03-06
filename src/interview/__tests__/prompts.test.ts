import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  getTranscript: vi.fn((session) => session.transcript),
}));

vi.mock('../controller.js', () => ({
  buildModelMessages: vi.fn((systemPrompt, session) => [
    { role: 'system', content: systemPrompt },
    ...session.transcript.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  ]),
}));

import { buildModelMessages } from '../controller.js';
import {
  INTERVIEW_SYSTEM_PROMPT,
  MAX_PROMPT_TOKENS,
  buildInterviewSystemPrompt,
  buildInterviewMessages,
  estimateTokenCount,
  estimateMessagesTokenCount,
  isPromptTooLarge,
} from '../prompts.js';
import type { Session } from '../../session/session.js';

const makeSession = (
  transcript: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
  transcript: transcript.map((m) => ({ ...m, timestamp: '2026-01-01T00:00:00.000Z' })),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(buildModelMessages).mockImplementation((systemPrompt, session) => [
    { role: 'system', content: systemPrompt },
    ...session.transcript.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
  ]);
});

describe('INTERVIEW_SYSTEM_PROMPT', () => {
  it('contains instructions to ask one question at a time', () => {
    expect(INTERVIEW_SYSTEM_PROMPT).toContain('exactly ONE question');
  });

  it('contains the completion marker signal', () => {
    expect(INTERVIEW_SYSTEM_PROMPT).toContain('[INTERVIEW_COMPLETE]');
  });
});

describe('buildInterviewSystemPrompt', () => {
  it('includes the base system prompt', () => {
    const result = buildInterviewSystemPrompt('A todo app');
    expect(result).toContain(INTERVIEW_SYSTEM_PROMPT);
  });

  it('injects the project idea into the prompt', () => {
    const result = buildInterviewSystemPrompt('A todo app for teams');
    expect(result).toContain('A todo app for teams');
  });

  it('labels the project idea clearly', () => {
    const result = buildInterviewSystemPrompt('My project');
    expect(result).toContain("project idea");
    expect(result).toContain('My project');
  });
});

describe('estimateTokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('estimates token count as roughly chars / 4', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokenCount(text)).toBe(100);
  });

  it('rounds up for non-divisible lengths', () => {
    expect(estimateTokenCount('abc')).toBe(1); // 3 / 4 = 0.75, ceil = 1
    expect(estimateTokenCount('abcde')).toBe(2); // 5 / 4 = 1.25, ceil = 2
  });
});

describe('estimateMessagesTokenCount', () => {
  it('returns 0 for empty messages', () => {
    expect(estimateMessagesTokenCount([])).toBe(0);
  });

  it('sums token counts across all messages with 4-token overhead each', () => {
    const messages = [
      { role: 'system' as const, content: 'a'.repeat(40) }, // 10 tokens + 4 overhead = 14
      { role: 'user' as const, content: 'b'.repeat(40) },   // 10 tokens + 4 overhead = 14
    ];
    expect(estimateMessagesTokenCount(messages)).toBe(28);
  });
});

describe('isPromptTooLarge', () => {
  it('returns false for small prompts', () => {
    const messages = [{ role: 'system' as const, content: 'short prompt' }];
    expect(isPromptTooLarge(messages)).toBe(false);
  });

  it('returns true when estimated tokens exceed MAX_PROMPT_TOKENS', () => {
    const largeContent = 'a'.repeat(MAX_PROMPT_TOKENS * 4 + 100);
    const messages = [{ role: 'system' as const, content: largeContent }];
    expect(isPromptTooLarge(messages)).toBe(true);
  });

  it('returns false when exactly at the limit', () => {
    // MAX_PROMPT_TOKENS * 4 chars = MAX_PROMPT_TOKENS tokens, minus overhead
    const content = 'a'.repeat((MAX_PROMPT_TOKENS - 4) * 4);
    const messages = [{ role: 'system' as const, content }];
    expect(isPromptTooLarge(messages)).toBe(false);
  });
});

describe('buildInterviewMessages', () => {
  it('calls buildModelMessages with system prompt containing project idea', () => {
    const session = makeSession();
    buildInterviewMessages(session, 'A task manager app');

    expect(buildModelMessages).toHaveBeenCalledOnce();
    const [systemPrompt] = vi.mocked(buildModelMessages).mock.calls[0];
    expect(systemPrompt).toContain('A task manager app');
    expect(systemPrompt).toContain(INTERVIEW_SYSTEM_PROMPT);
  });

  it('returns messages from buildModelMessages', () => {
    const session = makeSession([{ role: 'assistant', content: 'What is your idea?' }]);
    const messages = buildInterviewMessages(session, 'A chat app');

    expect(messages).toHaveLength(2); // system + 1 transcript message
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'assistant', content: 'What is your idea?' });
  });

  it('includes transcript messages in returned messages', () => {
    const session = makeSession([
      { role: 'assistant', content: 'Question?' },
      { role: 'user', content: 'Answer.' },
    ]);
    const messages = buildInterviewMessages(session, 'My project');
    expect(messages).toHaveLength(3);
  });
});
