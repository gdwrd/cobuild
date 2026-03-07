import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  persistErrorState: vi.fn(),
  loadSession: vi.fn((sessionId: string) => ({ id: sessionId })),
  persistCurrentDevPlanPhase: vi.fn((session: Session, phaseNumber: number) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  })),
  persistDevPlanPhaseCompletion: vi.fn((session: Session) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  })),
  persistDevPlanHalt: vi.fn((session: Session, failedPhaseNumber: number) => ({
    ...session,
    devPlanHalted: true,
    currentDevPlanPhase: failedPhaseNumber,
    updatedAt: 'now',
  })),
  persistDevPlanStage: vi.fn((session: Session) => ({
    ...session,
    stage: 'dev-plans',
    updatedAt: 'now',
  })),
  completeDevPlanStage: vi.fn((session: Session) => ({
    ...session,
    devPlansComplete: true,
    updatedAt: 'now',
  })),
}));

import {
  saveSession,
  persistErrorState,
  persistCurrentDevPlanPhase,
  persistDevPlanPhaseCompletion,
  persistDevPlanHalt,
  persistDevPlanStage,
  completeDevPlanStage,
} from '../../session/session.js';
import { DevPlanGenerator } from '../dev-plan-generator.js';
import { writeDevPlanFile, generateDevPlanFilename } from '../dev-plan-file-writer.js';
import { runDevPlanLoop } from '../dev-plan-loop.js';
import { RetryExhaustedError, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import type { Session, PlanPhase } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const makeValidDevPlan = (phaseNumber: number): string =>
  `# Plan: Phase ${phaseNumber} – Foundation Setup

## Overview

This phase sets up the project foundation for phase ${phaseNumber}.

## Validation Commands

- npm run build
- npm test

### Task 1: Initialize Project

- [ ] Create directory structure
- [ ] Configure toolchain

### Task 2: Set Up CI

- [ ] Add CI configuration
- [ ] Verify pipeline runs
`;

const makePhase = (number: number, title = `Phase ${number} Title`): PlanPhase => ({
  number,
  title,
  goal: `Goal for phase ${number}`,
  scope: `Scope for phase ${number}`,
  deliverables: `Deliverables for phase ${number}`,
  dependencies: number === 1 ? 'None' : `Phase ${number - 1}`,
  acceptanceCriteria: `Acceptance criteria for phase ${number}`,
});

const makeFourPhases = (): PlanPhase[] => [
  makePhase(1, 'Foundation'),
  makePhase(2, 'Core Data Layer'),
  makePhase(3, 'API Layer'),
  makePhase(4, 'Frontend Integration'),
];

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'dev-plan-integration-sess',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/tmp/test-project',
  completed: true,
  stage: 'plan',
  transcript: [],
  specArtifact: {
    content: '# Spec\n\n## Project Overview\n\nA test project.\n\n## Functional Requirements\n\n- Feature A\n\n## Acceptance Criteria\n\n- Tests pass.',
    filePath: '/tmp/test-project/docs/spec.md',
    generated: true,
  },
  architectureArtifact: {
    content: '# Architecture\n\n## System Components\n\nWeb server and database.',
    filePath: '/tmp/test-project/docs/architecture.md',
    generated: true,
  },
  planArtifact: {
    content: '# Plan\n\n## Phase 1: Foundation\n\nSetup.',
    filePath: '/tmp/test-project/docs/plan.md',
    generated: true,
  },
  extractedPhases: makeFourPhases(),
  ...overrides,
});

const makeProvider = (responseOrResponses: string | string[]): ModelProvider => {
  if (typeof responseOrResponses === 'string') {
    return { generate: vi.fn(async () => responseOrResponses) };
  }
  const responses = [...responseOrResponses];
  let callIndex = 0;
  return {
    generate: vi.fn(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    }),
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(persistCurrentDevPlanPhase).mockImplementation((session, phaseNumber) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanPhaseCompletion).mockImplementation((session) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanHalt).mockImplementation((session, failedPhaseNumber) => ({
    ...session,
    devPlanHalted: true,
    currentDevPlanPhase: failedPhaseNumber,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanStage).mockImplementation((session) => ({
    ...session,
    stage: 'dev-plans' as const,
    updatedAt: 'now',
  }));
  vi.mocked(completeDevPlanStage).mockImplementation((session) => ({
    ...session,
    devPlansComplete: true,
    updatedAt: 'now',
  }));
});

// ─── dev plan generation after high-level plan ────────────────────────────────

describe('dev plan generation after high-level plan', () => {
  it('generates a dev plan with correct phaseNumber from a valid provider response', async () => {
    const session = makeSession();
    const phase = makePhase(1, 'Foundation');
    const provider = makeProvider(makeValidDevPlan(1));
    const generator = new DevPlanGenerator();

    const result = await generator.generate(session, provider, phase, []);

    expect(result.phaseNumber).toBe(1);
    expect(result.content).toBe(makeValidDevPlan(1).trim());
  });

  it('passes spec, architecture, and plan content to the provider', async () => {
    const session = makeSession({
      specArtifact: { content: 'My unique spec content', filePath: '/docs/spec.md', generated: true },
      architectureArtifact: { content: 'My unique arch content', filePath: '/docs/arch.md', generated: true },
      planArtifact: { content: 'My unique plan content', filePath: '/docs/plan.md', generated: true },
    });
    const phase = makePhase(1);
    const provider = makeProvider(makeValidDevPlan(1));
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My unique spec content');
    expect(userMessage?.content).toContain('My unique arch content');
    expect(userMessage?.content).toContain('My unique plan content');
  });

  it('passes phase metadata to the provider', async () => {
    const session = makeSession();
    const phase = makePhase(2, 'Core Data Layer');
    const provider = makeProvider(makeValidDevPlan(2));
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Core Data Layer');
    expect(userMessage?.content).toContain(`Goal for phase 2`);
  });

  it('increments devPlanGenerationAttempts in session on each attempt', async () => {
    const session = makeSession({ devPlanGenerationAttempts: 0 });
    const phase = makePhase(1);
    const provider = makeProvider(makeValidDevPlan(1));
    const generator = new DevPlanGenerator();

    await generator.generate(session, provider, phase, []);

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
    const savedSessions = vi.mocked(saveSession).mock.calls.map((c) => c[0] as Session);
    const withAttempts = savedSessions.find((s) => (s.devPlanGenerationAttempts ?? 0) > 0);
    expect(withAttempts).toBeDefined();
    expect(withAttempts!.devPlanGenerationAttempts).toBe(1);
  });

  it('throws DevPlanValidationError when provider returns content missing required sections', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const phase = makePhase(1);
    const provider = makeProvider('# Not a valid plan at all — missing all required sections');
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Dev plan validation failed');
    vi.useRealTimers();
  });

  it('throws DevPlanValidationError when provider returns plan with code snippet', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const phase = makePhase(1);
    const invalidPlan = makeValidDevPlan(1) + '\n```typescript\nconst x = 1;\n```\n';
    const provider = makeProvider(invalidPlan);
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Dev plan validation failed');
    vi.useRealTimers();
  });
});

// ─── generation of multiple phases sequentially ───────────────────────────────

describe('generation of multiple phases sequentially', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('generates plans for all 4 phases, each referencing the correct phase number', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const responses = [1, 2, 3, 4].map((n) => makeValidDevPlan(n));
    const provider = makeProvider(responses);
    const onPhaseComplete = vi.fn();

    const result = await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });

    expect(onPhaseComplete).toHaveBeenCalledTimes(4);
    expect(onPhaseComplete).toHaveBeenNthCalledWith(1, 1, expect.any(String));
    expect(onPhaseComplete).toHaveBeenNthCalledWith(2, 2, expect.any(String));
    expect(onPhaseComplete).toHaveBeenNthCalledWith(3, 3, expect.any(String));
    expect(onPhaseComplete).toHaveBeenNthCalledWith(4, 4, expect.any(String));
    expect(result.devPlansComplete).toBe(true);
  });

  it('writes plan files for all 4 phases under docs/plans/', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const responses = [1, 2, 3, 4].map((n) => makeValidDevPlan(n));
    const provider = makeProvider(responses);
    const filePaths: string[] = [];

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: (_, filePath) => filePaths.push(filePath),
    });

    expect(filePaths).toHaveLength(4);
    for (const filePath of filePaths) {
      expect(filePath).toContain(path.join('docs', 'plans'));
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('passes accumulated previous dev plans to each subsequent phase', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const responses = [1, 2, 3, 4].map((n) => makeValidDevPlan(n));
    const provider = makeProvider(responses);

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });

    // Provider is called 4 times, one per phase
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(4);
    // Phase 2 message should contain phase 1's content
    const phase2Messages = vi.mocked(provider.generate).mock.calls[1][0];
    const phase2User = phase2Messages.find((m: { role: string }) => m.role === 'user');
    expect(phase2User?.content).toContain('Phase 1');
    // Phase 3 message should contain both phase 1 and 2 content
    const phase3Messages = vi.mocked(provider.generate).mock.calls[2][0];
    const phase3User = phase3Messages.find((m: { role: string }) => m.role === 'user');
    expect(phase3User?.content).toContain('Phase 1');
    expect(phase3User?.content).toContain('Phase 2');
  });

  it('calls persistDevPlanStage once at the start', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const responses = [1, 2, 3, 4].map((n) => makeValidDevPlan(n));
    const provider = makeProvider(responses);

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });

    expect(vi.mocked(persistDevPlanStage)).toHaveBeenCalledOnce();
  });

  it('calls completeDevPlanStage after all phases succeed', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const responses = [1, 2, 3, 4].map((n) => makeValidDevPlan(n));
    const provider = makeProvider(responses);

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });

    expect(vi.mocked(completeDevPlanStage)).toHaveBeenCalledOnce();
  });
});

// ─── retry behavior on validation failure ─────────────────────────────────────

describe('retry behavior on validation failure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds when the first attempt fails validation but second attempt returns valid content', async () => {
    vi.useFakeTimers();

    const session = makeSession({ devPlanGenerationAttempts: 0 });
    const phase = makePhase(1);
    const provider = makeProvider([
      '# Invalid plan — missing required sections',
      makeValidDevPlan(1),
    ]);
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result.phaseNumber).toBe(1);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries when provider consistently returns invalid content', async () => {
    vi.useFakeTimers();

    const session = makeSession();
    const phase = makePhase(1);
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here'),
    };
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls persistErrorState on retry exhaustion', async () => {
    vi.useFakeTimers();

    const session = makeSession();
    const phase = makePhase(3);
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here'),
    };
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(persistErrorState)).toHaveBeenCalledOnce();
    const [, errorMsg] = vi.mocked(persistErrorState).mock.calls[0];
    expect(errorMsg).toMatch(/dev plan generation failed for phase 3/);
  });

  it('increments attempt count on each retry', async () => {
    vi.useFakeTimers();

    const session = makeSession({ devPlanGenerationAttempts: 0 });
    const phase = makePhase(1);
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here'),
    };
    const generator = new DevPlanGenerator();

    const promise = generator.generate(session, provider, phase, []);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);

    const savedSessions = vi.mocked(saveSession).mock.calls.map((c) => c[0] as Session);
    const attempts = savedSessions.map((s) => s.devPlanGenerationAttempts ?? 0);
    expect(Math.max(...attempts)).toBe(DEFAULT_MAX_ATTEMPTS);
  });
});

// ─── stop on unrecoverable phase failure ──────────────────────────────────────

describe('stop on unrecoverable phase failure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-integration-'));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('stops generating further phases when phase 1 fails with retry exhaustion', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here at all'),
    };
    const onPhaseComplete = vi.fn();

    const loopPromise = runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });
    loopPromise.catch(() => {});
    await vi.runAllTimersAsync();
    const result = await loopPromise;

    // Only phase 1 was attempted (exhausted retries); phases 2–4 were not
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(onPhaseComplete).not.toHaveBeenCalled();
    expect(result.devPlanHalted).toBe(true);
  });

  it('persists halt state with failed phase number', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here at all'),
    };

    const loopPromise = runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });
    loopPromise.catch(() => {});
    await vi.runAllTimersAsync();
    await loopPromise;

    expect(vi.mocked(persistDevPlanHalt)).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('invokes onHalt callback with the failed phase number', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here at all'),
    };
    const onHalt = vi.fn();

    const loopPromise = runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
      onHalt,
    });
    loopPromise.catch(() => {});
    await vi.runAllTimersAsync();
    await loopPromise;

    expect(onHalt).toHaveBeenCalledWith(1);
  });

  it('does not call completeDevPlanStage when halted', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# No valid sections here at all'),
    };

    const loopPromise = runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });
    loopPromise.catch(() => {});
    await vi.runAllTimersAsync();
    await loopPromise;

    expect(vi.mocked(completeDevPlanStage)).not.toHaveBeenCalled();
  });

  it('completes phases 1–2 then stops when phase 3 fails', async () => {
    const session = makeSession({ workingDirectory: tmpDir });
    let callCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        // Phases 1 and 2 each call generate once and return valid content
        // Phase 3 always returns invalid content
        if (callCount <= 2) {
          const phaseNum = callCount;
          return makeValidDevPlan(phaseNum);
        }
        return '# No valid sections here';
      }),
    };
    const onPhaseComplete = vi.fn();

    const loopPromise = runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });
    loopPromise.catch(() => {});
    await vi.runAllTimersAsync();
    const result = await loopPromise;

    expect(onPhaseComplete).toHaveBeenCalledTimes(2);
    expect(onPhaseComplete).toHaveBeenNthCalledWith(1, 1, expect.any(String));
    expect(onPhaseComplete).toHaveBeenNthCalledWith(2, 2, expect.any(String));
    expect(vi.mocked(persistDevPlanHalt)).toHaveBeenCalledWith(expect.anything(), 3);
    expect(result.devPlanHalted).toBe(true);
  });
});

// ─── resume after partial generation ─────────────────────────────────────────

describe('resume after partial generation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('skips completed phases and generates only remaining ones', async () => {
    const session = makeSession({
      workingDirectory: tmpDir,
      devPlanArtifacts: [
        {
          phaseNumber: 1,
          content: makeValidDevPlan(1),
          filePath: path.join(tmpDir, 'docs', 'plans', 'phase-1.md'),
          generated: true,
        },
        {
          phaseNumber: 2,
          content: makeValidDevPlan(2),
          filePath: path.join(tmpDir, 'docs', 'plans', 'phase-2.md'),
          generated: true,
        },
      ],
    });
    // Phases 3 and 4 will be generated
    const responses = [makeValidDevPlan(3), makeValidDevPlan(4)];
    const provider = makeProvider(responses);
    const onPhaseComplete = vi.fn();

    const result = await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });

    // Provider called only for phases 3 and 4
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(2);
    // onPhaseComplete called for all 4 phases (2 from resume + 2 new)
    expect(onPhaseComplete).toHaveBeenCalledTimes(4);
    expect(result.devPlansComplete).toBe(true);
  });

  it('seeds previousDevPlans from already-completed artifacts', async () => {
    const phase1Content = makeValidDevPlan(1);
    const phase2Content = makeValidDevPlan(2);
    const session = makeSession({
      workingDirectory: tmpDir,
      devPlanArtifacts: [
        { phaseNumber: 1, content: phase1Content, filePath: '/docs/plans/phase-1.md', generated: true },
        { phaseNumber: 2, content: phase2Content, filePath: '/docs/plans/phase-2.md', generated: true },
      ],
    });
    const responses = [makeValidDevPlan(3), makeValidDevPlan(4)];
    const provider = makeProvider(responses);

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });

    // Phase 3 (first generated) should receive both previous plans in context
    const phase3Messages = vi.mocked(provider.generate).mock.calls[0][0];
    const phase3User = phase3Messages.find((m: { role: string }) => m.role === 'user');
    expect(phase3User?.content).toContain(phase1Content);
    expect(phase3User?.content).toContain(phase2Content);
  });

  it('calls onPhaseComplete for already-completed phases on resume', async () => {
    const existingFilePath = path.join(tmpDir, 'docs', 'plans', 'phase-1.md');
    const session = makeSession({
      workingDirectory: tmpDir,
      devPlanArtifacts: [
        { phaseNumber: 1, content: makeValidDevPlan(1), filePath: existingFilePath, generated: true },
      ],
    });
    const responses = [makeValidDevPlan(2), makeValidDevPlan(3), makeValidDevPlan(4)];
    const provider = makeProvider(responses);
    const onPhaseComplete = vi.fn();

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });

    // Phase 1 is signalled first via resume path
    expect(onPhaseComplete).toHaveBeenNthCalledWith(1, 1, existingFilePath);
    // Then phases 2–4 are generated
    expect(onPhaseComplete).toHaveBeenCalledTimes(4);
  });
});

// ─── filename collision handling ──────────────────────────────────────────────

describe('filename collision handling', () => {
  it('generates unique filenames when the same phase is written twice', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-collision-'));
    try {
      const phase = makePhase(1, 'Infrastructure');
      const content = makeValidDevPlan(1);

      const result1 = writeDevPlanFile(tmpDir, phase, content);
      const result2 = writeDevPlanFile(tmpDir, phase, content);

      expect(result1.filePath).not.toBe(result2.filePath);
      expect(fs.existsSync(result1.filePath)).toBe(true);
      expect(fs.existsSync(result2.filePath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('appends -2 suffix on first collision', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-collision-'));
    try {
      const phase = makePhase(2, 'Core Data Layer');
      const content = makeValidDevPlan(2);
      const fixedDate = new Date('2026-03-07T00:00:00Z');

      // Pre-create the expected filename to force collision
      const plansDir = path.join(tmpDir, 'docs', 'plans');
      fs.mkdirSync(plansDir, { recursive: true });
      const expectedFilename = generateDevPlanFilename(phase, fixedDate);
      fs.writeFileSync(path.join(plansDir, expectedFilename), 'existing');

      const result = writeDevPlanFile(tmpDir, phase, content);

      expect(result.filePath).not.toBe(path.join(plansDir, expectedFilename));
      expect(fs.existsSync(result.filePath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('increments suffix beyond -2 when multiple collisions exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-collision-'));
    try {
      const phase = makePhase(3, 'API Layer');
      const content = makeValidDevPlan(3);

      const result1 = writeDevPlanFile(tmpDir, phase, content);
      const result2 = writeDevPlanFile(tmpDir, phase, content);
      const result3 = writeDevPlanFile(tmpDir, phase, content);

      const paths = [result1.filePath, result2.filePath, result3.filePath];
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(3);
      for (const p of paths) {
        expect(fs.existsSync(p)).toBe(true);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writes correct content when collision is resolved', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-collision-'));
    try {
      const phase = makePhase(4, 'Frontend Integration');
      const content1 = makeValidDevPlan(4);
      const content2 = makeValidDevPlan(4) + '\n\nExtra content for collision test.';

      writeDevPlanFile(tmpDir, phase, content1);
      const result2 = writeDevPlanFile(tmpDir, phase, content2);

      expect(fs.readFileSync(result2.filePath, 'utf8')).toBe(content2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('filename follows YYYY-MM-DD-phase-N-title.md format', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-collision-'));
    try {
      const phase = makePhase(1, 'Foundation');
      const result = writeDevPlanFile(tmpDir, phase, makeValidDevPlan(1));

      const filename = path.basename(result.filePath);
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-phase-1-foundation\.md$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
