import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  persistErrorState: vi.fn(),
}));

vi.mock('../../interview/retry.js', () => ({
  DEFAULT_MAX_ATTEMPTS: 5,
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { saveSession, persistErrorState } from '../../session/session.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import { normalizeArchOutput, incrementArchGenerationAttempts, ArchGenerator } from '../arch-generator.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const VALID_ARCH = `# Architecture

## System Components

Web server, database, cache.

## Data Flow

Request → Server → DB → Response.

## External Integrations

None.

## Storage Choices

PostgreSQL.

## Deployment and Runtime Model

Docker + Kubernetes.

## Security Considerations

TLS, auth tokens.

## Failure Handling

Retry with backoff.
`;

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'architecture',
  transcript: [],
  specArtifact: { content: '# Spec\n\nProject spec content.', filePath: '/docs/spec.md', generated: true },
  ...overrides,
});

const makeProvider = (response = VALID_ARCH): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withRetry).mockImplementation(async (fn) => fn());
});

describe('normalizeArchOutput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeArchOutput('  hello  ')).toBe('hello');
  });

  it('trims leading newlines', () => {
    expect(normalizeArchOutput('\n\n# Architecture\n')).toBe('# Architecture');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeArchOutput('   \n  ')).toBe('');
  });

  it('returns unchanged string when already normalized', () => {
    const input = '# Architecture\n\nContent here.';
    expect(normalizeArchOutput(input)).toBe(input);
  });
});

describe('incrementArchGenerationAttempts', () => {
  it('increments from zero when not set', () => {
    const session = makeSession({ architectureGenerationAttempts: undefined });
    const updated = incrementArchGenerationAttempts(session);
    expect(updated.architectureGenerationAttempts).toBe(1);
  });

  it('increments from existing count', () => {
    const session = makeSession({ architectureGenerationAttempts: 2 });
    const updated = incrementArchGenerationAttempts(session);
    expect(updated.architectureGenerationAttempts).toBe(3);
  });

  it('persists the updated session', () => {
    const session = makeSession();
    const updated = incrementArchGenerationAttempts(session);
    expect(vi.mocked(saveSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(saveSession)).toHaveBeenCalledWith(updated);
  });

  it('updates updatedAt', () => {
    const session = makeSession();
    const before = session.updatedAt;
    const updated = incrementArchGenerationAttempts(session);
    expect(updated.updatedAt).not.toBe(before);
  });

  it('does not mutate the original session', () => {
    const session = makeSession({ architectureGenerationAttempts: 1 });
    incrementArchGenerationAttempts(session);
    expect(session.architectureGenerationAttempts).toBe(1);
  });

  it('does not modify generationAttempts (spec field)', () => {
    const session = makeSession({ generationAttempts: 3 });
    const updated = incrementArchGenerationAttempts(session);
    expect(updated.generationAttempts).toBe(3);
  });
});

describe('ArchGenerator', () => {
  it('sends arch messages to the provider', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(provider.generate)).toHaveBeenCalledOnce();
    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('returns an ArtifactResult with type architecture', async () => {
    const session = makeSession();
    const provider = makeProvider('  ' + VALID_ARCH + '  ');
    const generator = new ArchGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('architecture');
    expect(result.content).toBe(VALID_ARCH.trim());
  });

  it('normalizes whitespace in model response', async () => {
    const session = makeSession();
    const provider = makeProvider('\n\n' + VALID_ARCH + '\n\n');
    const generator = new ArchGenerator();

    const result = await generator.generate(session, provider);

    expect(result.content).toBe(VALID_ARCH.trim());
  });

  it('increments architecture generation attempts in session', async () => {
    const session = makeSession({ architectureGenerationAttempts: 0 });
    const provider = makeProvider();
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
    const savedSession = vi.mocked(saveSession).mock.calls[0][0] as Session;
    expect(savedSession.architectureGenerationAttempts).toBe(1);
  });

  it('propagates provider errors', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => { throw new Error('provider down'); }),
    };
    const generator = new ArchGenerator();

    await expect(generator.generate(session, provider)).rejects.toThrow('provider down');
  });

  it('uses withRetry for the provider call', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(withRetry)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(withRetry).mock.calls[0];
    expect(options?.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls persistErrorState via onRetryExhausted callback', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new ArchGenerator();

    vi.mocked(withRetry).mockImplementationOnce(async (_fn, options) => {
      options?.onRetryExhausted?.(new Error('timeout'), 5);
      throw new Error('Model request failed after 5 attempt(s): timeout');
    });

    await expect(generator.generate(session, provider)).rejects.toThrow();
    expect(vi.mocked(persistErrorState)).toHaveBeenCalledOnce();
    const [, errorMsg] = vi.mocked(persistErrorState).mock.calls[0];
    expect(errorMsg).toMatch(/architecture generation failed after 5 attempts/);
    expect(errorMsg).toMatch(/timeout/);
  });

  it('propagates RetryExhaustedError from withRetry', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new ArchGenerator();
    const retryError = new Error('Model request failed after 5 attempt(s): provider down');
    retryError.name = 'RetryExhaustedError';

    vi.mocked(withRetry).mockRejectedValueOnce(retryError);

    await expect(generator.generate(session, provider)).rejects.toThrow(
      'Model request failed after 5 attempt(s): provider down',
    );
  });

  it('user message contains the spec content', async () => {
    const session = makeSession({
      specArtifact: { content: 'My custom spec', filePath: '/docs/spec.md', generated: true },
    });
    const provider = makeProvider();
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My custom spec');
  });
});
