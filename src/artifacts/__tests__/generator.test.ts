import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
}));

import { saveSession } from '../../session/session.js';
import {
  transitionToArtifactStage,
  runArtifactPipeline,
} from '../generator.js';
import type { ArtifactGenerator, ArtifactResult } from '../generator.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'interview',
  transcript: [],
  ...overrides,
});

const makeProvider = (): ModelProvider => ({
  generate: vi.fn(async () => 'model response'),
});

const makeGenerator = (result: ArtifactResult): ArtifactGenerator => ({
  generate: vi.fn(async () => result),
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('transitionToArtifactStage', () => {
  it('transitions session stage and persists it', () => {
    const session = makeSession({ stage: 'interview' });
    const updated = transitionToArtifactStage(session, 'spec');

    expect(updated.stage).toBe('spec');
    expect(updated.id).toBe(session.id);
    expect(vi.mocked(saveSession)).toHaveBeenCalledOnce();
    expect(vi.mocked(saveSession)).toHaveBeenCalledWith(updated);
  });

  it('updates updatedAt timestamp', () => {
    const session = makeSession();
    const before = session.updatedAt;
    const updated = transitionToArtifactStage(session, 'spec');
    expect(updated.updatedAt).not.toBe(before);
  });

  it('does not mutate the original session', () => {
    const session = makeSession({ stage: 'interview' });
    transitionToArtifactStage(session, 'spec');
    expect(session.stage).toBe('interview');
  });
});

describe('runArtifactPipeline', () => {
  it('calls generator with updated session and provider', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const expectedResult: ArtifactResult = { type: 'spec', content: '# Spec\n...' };
    const generator = makeGenerator(expectedResult);

    const { result, session: updatedSession } = await runArtifactPipeline(
      session,
      provider,
      generator,
      'spec',
    );

    expect(result).toEqual(expectedResult);
    expect(updatedSession.stage).toBe('spec');
    expect(vi.mocked(generator.generate)).toHaveBeenCalledOnce();
  });

  it('transitions stage before calling generator', async () => {
    const session = makeSession({ stage: 'interview' });
    const provider = makeProvider();
    let stageAtGeneration: string | undefined;
    const generator: ArtifactGenerator = {
      generate: vi.fn(async (s) => {
        stageAtGeneration = s.stage;
        return { type: 'spec' as const, content: 'content' };
      }),
    };

    await runArtifactPipeline(session, provider, generator, 'spec');

    expect(stageAtGeneration).toBe('spec');
  });

  it('persists stage transition before generation', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator = makeGenerator({ type: 'spec', content: 'x' });

    await runArtifactPipeline(session, provider, generator, 'spec');

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
  });

  it('propagates generator errors', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const generator: ArtifactGenerator = {
      generate: vi.fn(async () => { throw new Error('generation failed'); }),
    };

    await expect(runArtifactPipeline(session, provider, generator, 'spec')).rejects.toThrow(
      'generation failed',
    );
  });
});
