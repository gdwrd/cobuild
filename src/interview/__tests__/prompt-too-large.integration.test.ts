import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  appendInterviewMessage: vi.fn((session) => session),
  getTranscript: vi.fn(() => []),
  completeInterview: vi.fn((session) => ({ ...session, completed: true })),
}));

import {
  runInterviewTurn,
  PromptTooLargeError,
  PROMPT_TOO_LARGE_MESSAGE,
  buildModelMessages,
} from '../controller.js';
import { getTranscript } from '../../session/session.js';
import { MAX_PROMPT_TOKENS, isPromptTooLarge, estimateMessagesTokenCount } from '../prompts.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../controller.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'prompt-too-large-sess',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/tmp/test-project',
  completed: false,
  stage: 'interview',
  transcript: [],
  ...overrides,
});

function makeLargeMessage(targetTokens: number): string {
  // Each character ≈ 0.25 tokens, so multiply by 4 for characters
  return 'x'.repeat(targetTokens * 4);
}

// ─── isPromptTooLarge ─────────────────────────────────────────────────────────

describe('isPromptTooLarge', () => {
  it('returns false for a small message set well under the token limit', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'Hello, what are you building?' },
    ];
    expect(isPromptTooLarge(messages)).toBe(false);
  });

  it('returns true when messages exceed MAX_PROMPT_TOKENS', () => {
    const largeContent = makeLargeMessage(MAX_PROMPT_TOKENS + 100);
    const messages = [{ role: 'user' as const, content: largeContent }];
    expect(isPromptTooLarge(messages)).toBe(true);
  });

  it('returns false for messages exactly at the token limit', () => {
    // Build a message set whose total token estimate is exactly MAX_PROMPT_TOKENS
    // estimateMessagesTokenCount = sum(ceil(content.length / 4) + 4 per message)
    // For a single message: ceil(len / 4) + 4 = MAX_PROMPT_TOKENS → len = (MAX_PROMPT_TOKENS - 4) * 4
    const targetChars = (MAX_PROMPT_TOKENS - 4) * 4;
    const messages = [{ role: 'user' as const, content: 'x'.repeat(targetChars) }];
    const estimate = estimateMessagesTokenCount(messages);
    expect(estimate).toBe(MAX_PROMPT_TOKENS);
    expect(isPromptTooLarge(messages)).toBe(false);
  });

  it('returns true for messages one token over the limit', () => {
    const targetChars = (MAX_PROMPT_TOKENS - 4) * 4 + 4; // +4 chars = +1 token
    const messages = [{ role: 'user' as const, content: 'x'.repeat(targetChars) }];
    expect(isPromptTooLarge(messages)).toBe(true);
  });

  it('correctly handles multiple messages contributing to total', () => {
    // Split large content across multiple messages to verify accumulation
    const halfMax = Math.floor(MAX_PROMPT_TOKENS / 2);
    const messages = [
      { role: 'system' as const, content: makeLargeMessage(halfMax) },
      { role: 'user' as const, content: makeLargeMessage(halfMax) },
    ];
    expect(isPromptTooLarge(messages)).toBe(true);
  });
});

// ─── runInterviewTurn with oversized prompt ───────────────────────────────────

describe('runInterviewTurn prompt-too-large failure path', () => {
  it('throws PromptTooLargeError when the transcript causes messages to exceed token limit', async () => {
    const largeTranscript = Array.from({ length: 5 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: makeLargeMessage(2000),
      timestamp: '2026-01-01T00:00:00.000Z',
    }));

    vi.mocked(getTranscript).mockReturnValue(largeTranscript);

    const session = makeSession();
    const provider: ModelProvider = { generate: vi.fn(async () => 'response') };
    const systemPrompt = 'You are a helpful assistant.';

    await expect(runInterviewTurn(session, provider, systemPrompt)).rejects.toThrow(
      PromptTooLargeError,
    );
  });

  it('does not call the provider when the prompt is too large', async () => {
    const largeTranscript = [
      {
        role: 'user' as const,
        content: makeLargeMessage(MAX_PROMPT_TOKENS + 1000),
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ];

    vi.mocked(getTranscript).mockReturnValue(largeTranscript);

    const session = makeSession();
    const provider: ModelProvider = { generate: vi.fn(async () => 'response') };

    await expect(runInterviewTurn(session, provider, 'system')).rejects.toThrow(PromptTooLargeError);
    expect(vi.mocked(provider.generate)).not.toHaveBeenCalled();
  });

  it('PromptTooLargeError has the correct name', () => {
    const err = new PromptTooLargeError();
    expect(err.name).toBe('PromptTooLargeError');
  });

  it('PROMPT_TOO_LARGE_MESSAGE instructs user to use /finish-now', () => {
    expect(PROMPT_TOO_LARGE_MESSAGE).toContain('/finish-now');
  });

  it('allows a normal turn when the prompt is within the token limit', async () => {
    vi.mocked(getTranscript).mockReturnValue([
      { role: 'user', content: 'What are you building?', timestamp: '2026-01-01T00:00:00.000Z' },
    ]);

    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => 'Tell me more about your project.'),
    };

    const result = await runInterviewTurn(session, provider, 'You are an interviewer.');

    expect(result.response).toBe('Tell me more about your project.');
    expect(result.complete).toBe(false);
  });
});

// ─── buildModelMessages with large transcript ─────────────────────────────────

describe('buildModelMessages with large transcript', () => {
  it('includes all transcript messages in the built message list', () => {
    const transcript = [
      { role: 'user' as const, content: 'Hello', timestamp: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant' as const, content: 'Hi there', timestamp: '2026-01-01T00:00:00.000Z' },
    ];
    vi.mocked(getTranscript).mockReturnValue(transcript);

    const session = makeSession();
    const messages = buildModelMessages('system prompt', session);

    // system + 2 transcript messages
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('produces messages that exceed MAX_PROMPT_TOKENS with a large transcript', () => {
    const largeTranscript = Array.from({ length: 3 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: makeLargeMessage(3000),
      timestamp: '2026-01-01T00:00:00.000Z',
    }));
    vi.mocked(getTranscript).mockReturnValue(largeTranscript);

    const session = makeSession();
    const messages = buildModelMessages('short system prompt', session);

    expect(isPromptTooLarge(messages)).toBe(true);
  });
});
