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
import { normalizePlanOutput, incrementPlanGenerationAttempts, PlanGenerator } from '../plan-generator.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const VALID_PLAN = `## Phase 1: Foundation

### Goal
Set up the project skeleton.

### Scope
Initialize repository and toolchain.

### Deliverables
Working build system.

### Dependencies
None.

### Acceptance Criteria
Build passes.

## Phase 2: Core Features

### Goal
Implement primary functionality.

### Scope
Build main modules.

### Deliverables
Feature-complete MVP.

### Dependencies
Phase 1.

### Acceptance Criteria
All tests pass.

## Phase 3: Testing

### Goal
Achieve full test coverage.

### Scope
Write unit and integration tests.

### Deliverables
Test suite with 90% coverage.

### Dependencies
Phase 2.

### Acceptance Criteria
CI passes.

## Phase 4: Release

### Goal
Ship to production.

### Scope
Deploy and monitor.

### Deliverables
Live application.

### Dependencies
Phase 3.

### Acceptance Criteria
No critical errors in first 24 hours.
`;

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'plan',
  transcript: [],
  specArtifact: { content: '# Spec\n\nProject spec content.', filePath: '/docs/spec.md', generated: true },
  architectureArtifact: { content: '# Architecture\n\nArch content.', filePath: '/docs/arch.md', generated: true },
  ...overrides,
});

const makeProvider = (response = VALID_PLAN): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withRetry).mockImplementation(async (fn) => fn());
});

describe('normalizePlanOutput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizePlanOutput('  hello  ')).toBe('hello');
  });

  it('trims leading newlines', () => {
    expect(normalizePlanOutput('\n\n## Phase 1\n')).toBe('## Phase 1');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizePlanOutput('   \n  ')).toBe('');
  });

  it('returns unchanged string when already normalized', () => {
    const input = '## Phase 1\n\nContent here.';
    expect(normalizePlanOutput(input)).toBe(input);
  });
});

describe('incrementPlanGenerationAttempts', () => {
  it('increments from zero when not set', () => {
    const session = makeSession({ planGenerationAttempts: undefined });
    const updated = incrementPlanGenerationAttempts(session);
    expect(updated.planGenerationAttempts).toBe(1);
  });

  it('increments from existing count', () => {
    const session = makeSession({ planGenerationAttempts: 2 });
    const updated = incrementPlanGenerationAttempts(session);
    expect(updated.planGenerationAttempts).toBe(3);
  });

  it('persists the updated session', () => {
    const session = makeSession();
    const updated = incrementPlanGenerationAttempts(session);
    expect(vi.mocked(saveSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(saveSession)).toHaveBeenCalledWith(updated);
  });

  it('updates updatedAt', () => {
    const session = makeSession();
    const before = session.updatedAt;
    const updated = incrementPlanGenerationAttempts(session);
    expect(updated.updatedAt).not.toBe(before);
  });

  it('does not mutate the original session', () => {
    const session = makeSession({ planGenerationAttempts: 1 });
    incrementPlanGenerationAttempts(session);
    expect(session.planGenerationAttempts).toBe(1);
  });

  it('does not modify architectureGenerationAttempts', () => {
    const session = makeSession({ architectureGenerationAttempts: 3 });
    const updated = incrementPlanGenerationAttempts(session);
    expect(updated.architectureGenerationAttempts).toBe(3);
  });

  it('does not modify generationAttempts (spec field)', () => {
    const session = makeSession({ generationAttempts: 2 });
    const updated = incrementPlanGenerationAttempts(session);
    expect(updated.generationAttempts).toBe(2);
  });
});

describe('PlanGenerator', () => {
  it('sends plan messages to the provider', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(provider.generate)).toHaveBeenCalledOnce();
    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('returns an ArtifactResult with type plan', async () => {
    const session = makeSession();
    const provider = makeProvider('  ' + VALID_PLAN + '  ');
    const generator = new PlanGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('plan');
    expect(result.content).toBe(VALID_PLAN.trim());
  });

  it('normalizes whitespace in model response', async () => {
    const session = makeSession();
    const provider = makeProvider('\n\n' + VALID_PLAN + '\n\n');
    const generator = new PlanGenerator();

    const result = await generator.generate(session, provider);

    expect(result.content).toBe(VALID_PLAN.trim());
  });

  it('increments plan generation attempts in session', async () => {
    const session = makeSession({ planGenerationAttempts: 0 });
    const provider = makeProvider();
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
    const savedSession = vi.mocked(saveSession).mock.calls[0][0] as Session;
    expect(savedSession.planGenerationAttempts).toBe(1);
  });

  it('propagates provider errors', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => { throw new Error('provider down'); }),
    };
    const generator = new PlanGenerator();

    await expect(generator.generate(session, provider)).rejects.toThrow('provider down');
  });

  it('uses withRetry for the provider call', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    expect(vi.mocked(withRetry)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(withRetry).mock.calls[0];
    expect(options?.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls persistErrorState via onRetryExhausted callback', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new PlanGenerator();

    vi.mocked(withRetry).mockImplementationOnce(async (_fn, options) => {
      options?.onRetryExhausted?.(new Error('timeout'), 5);
      throw new Error('Model request failed after 5 attempt(s): timeout');
    });

    await expect(generator.generate(session, provider)).rejects.toThrow();
    expect(vi.mocked(persistErrorState)).toHaveBeenCalledOnce();
    const [, errorMsg] = vi.mocked(persistErrorState).mock.calls[0];
    expect(errorMsg).toMatch(/plan generation failed after 5 attempts/);
    expect(errorMsg).toMatch(/timeout/);
  });

  it('propagates RetryExhaustedError from withRetry', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = new PlanGenerator();
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
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My custom spec');
  });

  it('user message contains the architecture content', async () => {
    const session = makeSession({
      architectureArtifact: { content: 'My custom architecture', filePath: '/docs/arch.md', generated: true },
    });
    const provider = makeProvider();
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My custom architecture');
  });
});
