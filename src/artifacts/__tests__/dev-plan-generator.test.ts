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
import {
  normalizeDevPlanOutput,
  incrementDevPlanGenerationAttempts,
  DevPlanGenerator,
} from '../dev-plan-generator.js';
import type { Session, PlanPhase } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const makeValidDevPlan = (phaseNumber: number): string =>
  `# Plan: Phase ${phaseNumber} – Foundation Setup

## Overview

This phase sets up the project foundation including toolchain and initial structure.

## Validation Commands

- npm run build
- npm test

### Task 1: Initialize Repository

- [ ] Create project directory structure
- [ ] Set up package.json

### Task 2: Configure Toolchain

- [ ] Install TypeScript
- [ ] Configure tsconfig.json
`;

const VALID_DEV_PLAN = makeValidDevPlan(1);

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'dev-plans',
  transcript: [],
  specArtifact: { content: '# Spec\n\nProject spec content.', filePath: '/docs/spec.md', generated: true },
  architectureArtifact: { content: '# Architecture\n\nArch content.', filePath: '/docs/arch.md', generated: true },
  planArtifact: { content: '# Plan\n\nHigh-level plan.', filePath: '/docs/plan.md', generated: true },
  ...overrides,
});

const makePhase = (overrides: Partial<PlanPhase> = {}): PlanPhase => ({
  number: 1,
  title: 'Foundation Setup',
  goal: 'Establish project skeleton',
  scope: 'Initialize repository and toolchain',
  deliverables: 'Working build system',
  dependencies: 'None',
  acceptanceCriteria: 'Build passes',
  ...overrides,
});

const makeProvider = (response = VALID_DEV_PLAN): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withRetry).mockImplementation(async (fn) => fn());
});

describe('normalizeDevPlanOutput', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeDevPlanOutput('  hello  ')).toBe('hello');
  });

  it('trims leading newlines', () => {
    expect(normalizeDevPlanOutput('\n\n# Plan:\n')).toBe('# Plan:');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeDevPlanOutput('   \n  ')).toBe('');
  });

  it('returns unchanged string when already normalized', () => {
    const input = '# Plan: Phase One\n\n## Overview\n\nContent here.';
    expect(normalizeDevPlanOutput(input)).toBe(input);
  });
});

describe('incrementDevPlanGenerationAttempts', () => {
  it('increments from zero when not set', () => {
    const session = makeSession({ devPlanGenerationAttempts: undefined });
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(updated.devPlanGenerationAttempts).toBe(1);
  });

  it('increments from existing count', () => {
    const session = makeSession({ devPlanGenerationAttempts: 3 });
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(updated.devPlanGenerationAttempts).toBe(4);
  });

  it('persists the updated session', () => {
    const session = makeSession();
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(vi.mocked(saveSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(saveSession)).toHaveBeenCalledWith(updated);
  });

  it('updates updatedAt', () => {
    const session = makeSession();
    const before = session.updatedAt;
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(updated.updatedAt).not.toBe(before);
  });

  it('does not mutate the original session', () => {
    const session = makeSession({ devPlanGenerationAttempts: 2 });
    incrementDevPlanGenerationAttempts(session);
    expect(session.devPlanGenerationAttempts).toBe(2);
  });

  it('does not modify planGenerationAttempts', () => {
    const session = makeSession({ planGenerationAttempts: 3 });
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(updated.planGenerationAttempts).toBe(3);
  });

  it('does not modify architectureGenerationAttempts', () => {
    const session = makeSession({ architectureGenerationAttempts: 2 });
    const updated = incrementDevPlanGenerationAttempts(session);
    expect(updated.architectureGenerationAttempts).toBe(2);
  });
});

describe('DevPlanGenerator', () => {
  it('sends dev plan messages to the provider', async () => {
    const session = makeSession();
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    expect(vi.mocked(provider.generate)).toHaveBeenCalledOnce();
    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('returns a DevPlanResult with correct phaseNumber', async () => {
    const session = makeSession();
    const phase = makePhase({ number: 3 });
    const validPlan3 = makeValidDevPlan(3);
    const provider = makeProvider('  ' + validPlan3 + '  ');
    const generator = new DevPlanGenerator();

    const result = await generator.generate(session, provider, phase, []);

    expect(result.phaseNumber).toBe(3);
    expect(result.content).toBe(validPlan3.trim());
  });

  it('normalizes whitespace in model response', async () => {
    const session = makeSession();
    const phase = makePhase();
    const provider = makeProvider('\n\n' + VALID_DEV_PLAN + '\n\n');
    const generator = new DevPlanGenerator();

    const result = await generator.generate(session, provider, phase, []);

    expect(result.content).toBe(VALID_DEV_PLAN.trim());
  });

  it('increments dev plan generation attempts in session', async () => {
    const session = makeSession({ devPlanGenerationAttempts: 0 });
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
    const savedSession = vi.mocked(saveSession).mock.calls[0][0] as Session;
    expect(savedSession.devPlanGenerationAttempts).toBe(1);
  });

  it('propagates provider errors', async () => {
    const session = makeSession();
    const phase = makePhase();
    const provider: ModelProvider = {
      generate: vi.fn(async () => { throw new Error('provider down'); }),
    };
    const generator = new DevPlanGenerator();

    await expect(generator.generate(session, provider, phase, [])).rejects.toThrow('provider down');
  });

  it('throws when content fails dev plan validation', async () => {
    const session = makeSession();
    const phase = makePhase({ number: 1 });
    const provider = makeProvider('# Not a valid plan at all');
    const generator = new DevPlanGenerator();

    await expect(generator.generate(session, provider, phase, [])).rejects.toThrow(
      'Dev plan validation failed',
    );
  });

  it('increments attempt count on each retry attempt inside withRetry', async () => {
    const session = makeSession({ devPlanGenerationAttempts: 0 });
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    vi.mocked(withRetry).mockImplementationOnce(async (fn) => {
      await fn();
      return fn();
    });

    await generator.generate(session, provider, phase, []);

    const savedCalls = vi.mocked(saveSession).mock.calls.map((c) => (c[0] as Session).devPlanGenerationAttempts);
    expect(savedCalls).toContain(1);
    expect(savedCalls).toContain(2);
  });

  it('uses withRetry for the provider call', async () => {
    const session = makeSession();
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    expect(vi.mocked(withRetry)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(withRetry).mock.calls[0];
    expect(options?.maxAttempts).toBe(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls persistErrorState via onRetryExhausted callback', async () => {
    const session = makeSession();
    const phase = makePhase({ number: 2 });
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    vi.mocked(withRetry).mockImplementationOnce(async (_fn, options) => {
      options?.onRetryExhausted?.(new Error('timeout'), 5);
      throw new Error('Model request failed after 5 attempt(s): timeout');
    });

    await expect(generator.generate(session, provider, phase, [])).rejects.toThrow();
    expect(vi.mocked(persistErrorState)).toHaveBeenCalledOnce();
    const [, errorMsg] = vi.mocked(persistErrorState).mock.calls[0];
    expect(errorMsg).toMatch(/dev plan generation failed for phase 2 after 5 attempts/);
    expect(errorMsg).toMatch(/timeout/);
  });

  it('propagates RetryExhaustedError from withRetry', async () => {
    const session = makeSession();
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();
    const retryError = new Error('Model request failed after 5 attempt(s): provider down');
    retryError.name = 'RetryExhaustedError';

    vi.mocked(withRetry).mockRejectedValueOnce(retryError);

    await expect(generator.generate(session, provider, phase, [])).rejects.toThrow(
      'Model request failed after 5 attempt(s): provider down',
    );
  });

  it('user message contains the spec content', async () => {
    const session = makeSession({
      specArtifact: { content: 'My custom spec', filePath: '/docs/spec.md', generated: true },
    });
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My custom spec');
  });

  it('user message contains the architecture content', async () => {
    const session = makeSession({
      architectureArtifact: { content: 'My custom architecture', filePath: '/docs/arch.md', generated: true },
    });
    const phase = makePhase();
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My custom architecture');
  });

  it('user message contains previous dev plans when provided', async () => {
    const session = makeSession();
    const phase = makePhase({ number: 2 });
    const provider = makeProvider(makeValidDevPlan(2));
    const generator = new DevPlanGenerator();
    const previousPlans = ['# Plan: Phase One\n\nContent for phase one.'];

    await generator.generate(session, provider, phase, previousPlans);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Phase One');
  });

  it('user message contains current phase metadata', async () => {
    const session = makeSession();
    const phase = makePhase({ title: 'Custom Phase Title', goal: 'Custom goal here' });
    const provider = makeProvider();
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Custom Phase Title');
    expect(userMessage?.content).toContain('Custom goal here');
  });
});
