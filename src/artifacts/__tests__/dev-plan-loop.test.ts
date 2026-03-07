import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  persistCurrentDevPlanPhase: vi.fn((session, phaseNumber) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  })),
  persistDevPlanPhaseCompletion: vi.fn((session, _phaseNumber, _content, _filePath) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  })),
}));

vi.mock('../dev-plan-phases.js', () => ({
  loadAndValidatePhases: vi.fn(),
}));

const mockGeneratorGenerate = vi.fn();
vi.mock('../dev-plan-generator.js', () => ({
  DevPlanGenerator: vi.fn().mockImplementation(() => ({
    generate: mockGeneratorGenerate,
  })),
}));

vi.mock('../dev-plan-file-writer.js', () => ({
  writeDevPlanFile: vi.fn((_projectDir, phase, _content) => ({
    filePath: `/work/docs/plans/phase-${phase.number}.md`,
  })),
}));

import { persistCurrentDevPlanPhase, persistDevPlanPhaseCompletion } from '../../session/session.js';
import { loadAndValidatePhases } from '../dev-plan-phases.js';
import { DevPlanGenerator } from '../dev-plan-generator.js';
import { writeDevPlanFile } from '../dev-plan-file-writer.js';
import { runDevPlanLoop } from '../dev-plan-loop.js';
import type { Session, PlanPhase } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const makePhase = (number: number): PlanPhase => ({
  number,
  title: `Phase ${number}`,
  goal: `Goal ${number}`,
  scope: `Scope ${number}`,
  deliverables: `Deliverables ${number}`,
  dependencies: `Dependencies ${number}`,
  acceptanceCriteria: `Criteria ${number}`,
});

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'plan',
  transcript: [],
  extractedPhases: [],
  ...overrides,
});

const makeProvider = (): ModelProvider => ({
  generate: vi.fn(async () => 'response'),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(DevPlanGenerator).mockImplementation(() => ({
    generate: mockGeneratorGenerate,
  }));
  vi.mocked(persistCurrentDevPlanPhase).mockImplementation((session, phaseNumber) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanPhaseCompletion).mockImplementation((session, _phaseNumber, _c, _f) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  }));
  mockGeneratorGenerate.mockImplementation(async (_session, _provider, phase, _prev) => ({
    content: `# Plan: Phase ${phase.number}\n## Overview\n## Validation Commands\n### Task 1:\n- [ ] Do something`,
    phaseNumber: phase.number,
  }));
  vi.mocked(writeDevPlanFile).mockImplementation((_projectDir, phase, _content) => ({
    filePath: `/work/docs/plans/phase-${phase.number}.md`,
  }));
});

describe('runDevPlanLoop', () => {
  it('calls loadAndValidatePhases with the session', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(vi.mocked(loadAndValidatePhases)).toHaveBeenCalledWith(session);
  });

  it('calls onPhaseStart for each phase with correct args', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();
    const onPhaseStart = vi.fn();

    await runDevPlanLoop(session, provider, { onPhaseStart, onPhaseComplete: vi.fn() });

    expect(onPhaseStart).toHaveBeenCalledTimes(4);
    expect(onPhaseStart).toHaveBeenNthCalledWith(1, 1, 4);
    expect(onPhaseStart).toHaveBeenNthCalledWith(2, 2, 4);
    expect(onPhaseStart).toHaveBeenNthCalledWith(3, 3, 4);
    expect(onPhaseStart).toHaveBeenNthCalledWith(4, 4, 4);
  });

  it('calls persistCurrentDevPlanPhase before generating each phase', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(vi.mocked(persistCurrentDevPlanPhase)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(persistCurrentDevPlanPhase)).toHaveBeenNthCalledWith(1, expect.anything(), 1);
    expect(vi.mocked(persistCurrentDevPlanPhase)).toHaveBeenNthCalledWith(2, expect.anything(), 2);
  });

  it('calls generator.generate for each phase', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(mockGeneratorGenerate).toHaveBeenCalledTimes(4);
    expect(mockGeneratorGenerate).toHaveBeenNthCalledWith(1, expect.anything(), provider, phases[0], []);
  });

  it('passes accumulated previous dev plans to each subsequent phase', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    // phase 1 gets empty previous plans
    expect(mockGeneratorGenerate).toHaveBeenNthCalledWith(1, expect.anything(), provider, phases[0], []);
    // phase 2 gets phase 1's content
    const phase1Content = (await mockGeneratorGenerate.mock.results[0].value).content;
    expect(mockGeneratorGenerate).toHaveBeenNthCalledWith(2, expect.anything(), provider, phases[1], [phase1Content]);
    // phase 3 gets phase 1 and 2's content
    const phase2Content = (await mockGeneratorGenerate.mock.results[1].value).content;
    expect(mockGeneratorGenerate).toHaveBeenNthCalledWith(3, expect.anything(), provider, phases[2], [phase1Content, phase2Content]);
  });

  it('calls writeDevPlanFile for each phase', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(vi.mocked(writeDevPlanFile)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(writeDevPlanFile)).toHaveBeenNthCalledWith(
      1,
      session.workingDirectory,
      phases[0],
      expect.any(String),
    );
  });

  it('calls persistDevPlanPhaseCompletion for each phase', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(vi.mocked(persistDevPlanPhaseCompletion)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(persistDevPlanPhaseCompletion)).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      1,
      expect.any(String),
      '/work/docs/plans/phase-1.md',
    );
  });

  it('calls onPhaseComplete with phase number and file path', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();
    const onPhaseComplete = vi.fn();

    await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete });

    expect(onPhaseComplete).toHaveBeenCalledTimes(4);
    expect(onPhaseComplete).toHaveBeenNthCalledWith(1, 1, '/work/docs/plans/phase-1.md');
    expect(onPhaseComplete).toHaveBeenNthCalledWith(2, 2, '/work/docs/plans/phase-2.md');
  });

  it('phases are generated sequentially (not batched)', async () => {
    const order: string[] = [];
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();
    const onPhaseStart = vi.fn((n: number) => order.push(`start:${n}`));
    const onPhaseComplete = vi.fn((n: number) => order.push(`complete:${n}`));

    await runDevPlanLoop(session, provider, { onPhaseStart, onPhaseComplete });

    expect(order).toEqual([
      'start:1', 'complete:1',
      'start:2', 'complete:2',
      'start:3', 'complete:3',
      'start:4', 'complete:4',
    ]);
  });

  it('returns the final session after all phases complete', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();

    const result = await runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() });

    expect(result).toBeDefined();
    expect(result.id).toBe('sess-1');
  });

  it('propagates errors from generator', async () => {
    const phases = [makePhase(1), makePhase(2), makePhase(3), makePhase(4)];
    vi.mocked(loadAndValidatePhases).mockReturnValue({ phases, totalCount: 4 });
    const session = makeSession();
    const provider = makeProvider();
    mockGeneratorGenerate.mockRejectedValueOnce(new Error('generation failed'));

    await expect(
      runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() }),
    ).rejects.toThrow('generation failed');
  });

  it('propagates errors from loadAndValidatePhases', async () => {
    vi.mocked(loadAndValidatePhases).mockImplementation(() => {
      throw new Error('no phases');
    });
    const session = makeSession();
    const provider = makeProvider();

    await expect(
      runDevPlanLoop(session, provider, { onPhaseStart: vi.fn(), onPhaseComplete: vi.fn() }),
    ).rejects.toThrow('no phases');
  });
});
