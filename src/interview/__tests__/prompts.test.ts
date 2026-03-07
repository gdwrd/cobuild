import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import {
  INTERVIEW_SYSTEM_PROMPT,
  MAX_PROMPT_TOKENS,
  buildInterviewSystemPrompt,
  estimateTokenCount,
  estimateMessagesTokenCount,
  isPromptTooLarge,
} from '../prompts.js';

beforeEach(() => {
  vi.resetAllMocks();
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

  it('returns just the base prompt when project idea is empty', () => {
    const result = buildInterviewSystemPrompt('');
    expect(result).toBe(INTERVIEW_SYSTEM_PROMPT);
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

