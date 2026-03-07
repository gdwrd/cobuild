import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  getTranscript: vi.fn(() => []),
  persistErrorState: vi.fn(),
}));

vi.mock('../../interview/retry.js', () => ({
  DEFAULT_MAX_ATTEMPTS: 5,
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../spec-validator.js', () => ({
  assertValidSpec: vi.fn(),
  SpecValidationError: class SpecValidationError extends Error {
    constructor(public readonly result: { valid: boolean; missingSections: string[] }) {
      super(`Spec validation failed: missing sections — ${result.missingSections.join(', ')}`);
      this.name = 'SpecValidationError';
    }
  },
}));

import { saveSession, getTranscript, persistErrorState } from '../../session/session.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import { assertValidSpec, SpecValidationError } from '../spec-validator.js';
import { normalizeSpecOutput, incrementGenerationAttempts, SpecGenerator } from '../spec-generator.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const VALID_SPEC = `# Project Spec

## Project Overview

Test project description.

## Functional Requirements

- Feature A

## Acceptance Criteria

- All tests pass
`;

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'spec',
  transcript: [],
  ...overrides,
});

const makeProvider = (response = VALID_SPEC): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTranscript).mockReturnValue([]);
  vi.mocked(withRetry).mockImplementation(async (fn) => fn());
  vi.mocked(assertValidSpec).mockImplementation(() => undefined);
});

describe('normalizeSpecOutput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeSpecOutput('  hello  ')).toBe('hello');
  });

  it('trims leading newlines', () => {
    expect(normalizeSpecOutput('\n\n# Spec\n')).toBe('# Spec');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeSpecOutput('   \n  ')).toBe('');
  });

  it('returns unchanged string when already normalized', () => {
    const input = '# Spec\n\nContent here.';
    expect(normalizeSpecOutput(input)).toBe(input);
  });
});

describe('incrementGenerationAttempts', () => {
  it('increments from zero when not set', () => {
    const session = makeSession({ generationAttempts: undefined });
    const updated = incrementGenerationAttempts(session);
    expect(updated.generationAttempts).toBe(1);
  });

  it('increments from existing count', () => {
    const session = makeSession({ generationAttempts: 2 });
    const updated = incrementGenerationAttempts(session);
    expect(updated.generationAttempts).toBe(3);
  });

  it('persists the updated session', () => {
    const session = makeSession();
    const updated = incrementGenerationAttempts(session);
    expect(vi.mocked(saveSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(saveSession)).toHaveBeenCalledWith(updated);
  });

  it('updates updatedAt', () => {
    const session = makeSession();
    const before = session.updatedAt;
    const updated = incrementGenerationAttempts(session);
    expect(updated.updatedAt).not.toBe(before);
  });

  it('does not mutate the original session', () => {
    const session = makeSession({ generationAttempts: 1 });
    incrementGenerationAttempts(session);
    expect(session.generationAttempts).toBe(1);
  });
});

describe('SpecGenerator', () => {
  it('sends spec messages to the provider', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new SpecGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(provider.generate)).toHaveBeenCalledOnce();
    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('returns an ArtifactResult with type spec', async () => {
    const session = makeSession();
    const provider = makeProvider('  ' + VALID_SPEC + '  ');
    const generator = new SpecGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('spec');
    expect(result.content).toBe(VALID_SPEC.trim());
  });

  it('normalizes whitespace in model response', async () => {
    const session = makeSession();
    const provider = makeProvider('\n\n' + VALID_SPEC + '\n\n');
    const generator = new SpecGenerator();

    const result = await generator.generate(session, provider);

    expect(result.content).toBe(VALID_SPEC.trim());
  });

  it('throws SpecValidationError when provider returns content missing required sections', async () => {
    const session = makeSession();
    const provider = makeProvider('# Just a title\n\nSome content without required sections.');
    const generator = new SpecGenerator();

    vi.mocked(assertValidSpec).mockImplementationOnce(() => {
      const result = { valid: false, missingSections: ['project overview', 'functional requirements', 'acceptance criteria'] };
      throw new SpecValidationError(result);
    });

    await expect(generator.generate(session, provider)).rejects.toThrow(SpecValidationError);
  });

  it('increments generation attempts in session', async () => {
    const session = makeSession({ generationAttempts: 0 });
    const provider = makeProvider();
    const generator = new SpecGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
    const savedSession = vi.mocked(saveSession).mock.calls[0][0] as Session;
    expect(savedSession.generationAttempts).toBe(1);
  });

  it('propagates provider errors', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => { throw new Error('provider down'); }),
    };
    const generator = new SpecGenerator();

    await expect(generator.generate(session, provider)).rejects.toThrow('provider down');
  });

  it('uses withRetry for the provider call', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new SpecGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(withRetry)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(withRetry).mock.calls[0];
    expect(options?.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls persistErrorState via onRetryExhausted callback', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new SpecGenerator();

    vi.mocked(withRetry).mockImplementationOnce(async (_fn, options) => {
      options?.onRetryExhausted?.(new Error('timeout'), 5);
      throw new Error('Model request failed after 5 attempt(s): timeout');
    });

    await expect(generator.generate(session, provider)).rejects.toThrow();
    expect(vi.mocked(persistErrorState)).toHaveBeenCalledOnce();
    const [, errorMsg] = vi.mocked(persistErrorState).mock.calls[0];
    expect(errorMsg).toMatch(/spec generation failed after 5 attempts/);
    expect(errorMsg).toMatch(/timeout/);
  });

  it('propagates RetryExhaustedError from withRetry', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new SpecGenerator();
    const retryError = new Error('Model request failed after 5 attempt(s): provider down');
    retryError.name = 'RetryExhaustedError';

    vi.mocked(withRetry).mockRejectedValueOnce(retryError);

    await expect(generator.generate(session, provider)).rejects.toThrow(
      'Model request failed after 5 attempt(s): provider down',
    );
  });
});
