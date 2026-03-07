import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  persistWorkflowDecision: vi.fn((session, _stage, _decision) => ({ ...session, updatedAt: 'now' })),
  persistArchitectureArtifact: vi.fn((session, _content, _filePath) => ({ ...session, updatedAt: 'now' })),
  completeArchitectureStage: vi.fn((session) => ({ ...session, stage: 'plan', updatedAt: 'now' })),
  persistPlanArtifact: vi.fn((session, _content, _filePath) => ({ ...session, updatedAt: 'now' })),
  completePlanStage: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
  persistExtractedPhases: vi.fn((session, _phases) => ({ ...session, updatedAt: 'now' })),
}));

vi.mock('../generator.js', () => ({
  runArtifactPipeline: vi.fn(),
}));

vi.mock('../plan-parser.js', () => ({
  extractPhases: vi.fn(() => []),
}));

import {
  persistWorkflowDecision,
  persistArchitectureArtifact,
  completeArchitectureStage,
  persistPlanArtifact,
  completePlanStage,
  persistExtractedPhases,
} from '../../session/session.js';
import { runArtifactPipeline } from '../generator.js';
import { extractPhases } from '../plan-parser.js';
import { runPostSpecWorkflow } from '../workflow-controller.js';
import type { PostSpecWorkflowOptions } from '../workflow-controller.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';
import type { ArtifactGenerator } from '../generator.js';

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

const makeProvider = (): ModelProvider => ({
  generate: vi.fn(async () => 'response'),
});

const makeGenerator = (content: string, type: 'architecture' | 'plan'): ArtifactGenerator => ({
  generate: vi.fn(async () => ({ type: type as 'architecture' | 'plan', content })),
});

const makeOptions = (overrides: Partial<PostSpecWorkflowOptions> = {}): PostSpecWorkflowOptions => ({
  architectureGenerator: makeGenerator('# Architecture', 'architecture'),
  planGenerator: makeGenerator('# Plan', 'plan'),
  onDecision: vi.fn(async () => true),
  writeArtifactFile: vi.fn((_content, _dir, type) => `/work/docs/${type}.md`),
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(persistWorkflowDecision).mockImplementation((session, _stage, _decision) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(persistArchitectureArtifact).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(completeArchitectureStage).mockImplementation((session) => ({
    ...session,
    stage: 'plan' as const,
    updatedAt: 'now',
  }));
  vi.mocked(persistPlanArtifact).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(completePlanStage).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(persistExtractedPhases).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(extractPhases).mockReturnValue([]);
  vi.mocked(runArtifactPipeline).mockImplementation(async (session, _provider, generator, _type) => {
    const result = await generator.generate(session, _provider);
    return { session, result };
  });
});

describe('runPostSpecWorkflow', () => {
  it('terminates at architecture-decision when user declines architecture', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => false) });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBe('architecture-decision');
    expect(result.architectureFilePath).toBeUndefined();
    expect(result.planFilePath).toBeUndefined();
    expect(vi.mocked(options.onDecision)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArtifactPipeline)).not.toHaveBeenCalled();
  });

  it('generates architecture when user accepts, then terminates at plan-decision when declined', async () => {
    const session = makeSession();
    const provider = makeProvider();
    let callCount = 0;
    const onDecision = vi.fn(async () => {
      callCount++;
      return callCount === 1; // yes to architecture, no to plan
    });
    const options = makeOptions({ onDecision });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBe('plan-decision');
    expect(result.architectureFilePath).toBe('/work/docs/architecture.md');
    expect(result.planFilePath).toBeUndefined();
    expect(vi.mocked(onDecision)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runArtifactPipeline)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArtifactPipeline)).toHaveBeenCalledWith(
      expect.anything(),
      provider,
      options.architectureGenerator,
      'architecture',
    );
  });

  it('runs full pipeline when user accepts both decisions', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBeUndefined();
    expect(result.architectureFilePath).toBe('/work/docs/architecture.md');
    expect(result.planFilePath).toBe('/work/docs/plan.md');
    expect(vi.mocked(runArtifactPipeline)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runArtifactPipeline)).toHaveBeenNthCalledWith(
      1, expect.anything(), provider, options.architectureGenerator, 'architecture',
    );
    expect(vi.mocked(runArtifactPipeline)).toHaveBeenNthCalledWith(
      2, expect.anything(), provider, options.planGenerator, 'plan',
    );
  });

  it('persists workflow decisions for both stages', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(persistWorkflowDecision)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(persistWorkflowDecision)).toHaveBeenNthCalledWith(
      1, expect.anything(), 'architecture', true,
    );
    expect(vi.mocked(persistWorkflowDecision)).toHaveBeenNthCalledWith(
      2, expect.anything(), 'plan', true,
    );
  });

  it('persists architecture artifact after generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(persistArchitectureArtifact)).toHaveBeenCalledOnce();
    expect(vi.mocked(persistArchitectureArtifact)).toHaveBeenCalledWith(
      expect.anything(), '# Architecture', '/work/docs/architecture.md',
    );
  });

  it('persists plan artifact after generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(persistPlanArtifact)).toHaveBeenCalledOnce();
    expect(vi.mocked(persistPlanArtifact)).toHaveBeenCalledWith(
      expect.anything(), '# Plan', '/work/docs/plan.md',
    );
  });

  it('calls completeArchitectureStage after persisting architecture artifact', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(completeArchitectureStage)).toHaveBeenCalledOnce();
  });

  it('calls completePlanStage after persisting plan artifact', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(completePlanStage)).toHaveBeenCalledOnce();
  });

  it('notifies stage updates in correct order for full run', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const stages: string[] = [];
    const onStageUpdate = vi.fn((stage: string) => { stages.push(stage); });
    const options = makeOptions({ onDecision: vi.fn(async () => true), onStageUpdate });

    await runPostSpecWorkflow(session, provider, options);

    expect(stages).toEqual([
      'asking-architecture',
      'generating-architecture',
      'asking-plan',
      'generating-plan',
      'complete',
    ]);
  });

  it('notifies terminated stage when user declines architecture', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const stages: string[] = [];
    const options = makeOptions({
      onDecision: vi.fn(async () => false),
      onStageUpdate: vi.fn((s) => { stages.push(s); }),
    });

    await runPostSpecWorkflow(session, provider, options);

    expect(stages).toContain('terminated');
    expect(stages).not.toContain('generating-architecture');
  });

  it('extracts phases from plan content after generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(extractPhases)).toHaveBeenCalledOnce();
    expect(vi.mocked(extractPhases)).toHaveBeenCalledWith('# Plan');
  });

  it('persists extracted phases after plan generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const phases = [{ number: 1, title: 'Phase 1', goal: 'g', scope: 's', deliverables: 'd', dependencies: 'dep', acceptanceCriteria: 'ac' }];
    vi.mocked(extractPhases).mockReturnValue(phases);
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(persistExtractedPhases)).toHaveBeenCalledOnce();
    expect(vi.mocked(persistExtractedPhases)).toHaveBeenCalledWith(expect.anything(), phases);
  });

  it('does not extract phases when user declines plan generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    let callCount = 0;
    const options = makeOptions({
      onDecision: vi.fn(async () => {
        callCount++;
        return callCount === 1; // yes to architecture, no to plan
      }),
    });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(extractPhases)).not.toHaveBeenCalled();
    expect(vi.mocked(persistExtractedPhases)).not.toHaveBeenCalled();
  });

  it('propagates pipeline errors', async () => {
    const session = makeSession();
    const provider = makeProvider();
    vi.mocked(runArtifactPipeline).mockRejectedValueOnce(new Error('generation failed'));
    const options = makeOptions({ onDecision: vi.fn(async () => true) });

    await expect(runPostSpecWorkflow(session, provider, options)).rejects.toThrow('generation failed');
  });
});
