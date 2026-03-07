import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  getTranscript: vi.fn(() => []),
}));

import { saveSession, getTranscript } from '../../session/session.js';
import { normalizeSpecOutput, incrementGenerationAttempts, SpecGenerator } from '../spec-generator.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

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

const makeProvider = (response = '# Spec\n\n## Project Overview\nTest'): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTranscript).mockReturnValue([]);
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
    const provider = makeProvider('  # My Spec\n\nContent  ');
    const generator = new SpecGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('spec');
    expect(result.content).toBe('# My Spec\n\nContent');
  });

  it('normalizes whitespace in model response', async () => {
    const session = makeSession();
    const provider = makeProvider('\n\n# Spec\n\nBody\n\n');
    const generator = new SpecGenerator();

    const result = await generator.generate(session, provider);

    expect(result.content).toBe('# Spec\n\nBody');
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
});
