import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ScreenController } from '../ScreenController.js';
import type { StartupResult } from '../../cli/app-shell.js';
import { runInterviewLoop } from '../../interview/controller.js';
import { runArtifactPipeline } from '../../artifacts/generator.js';
import { RetryExhaustedError } from '../../interview/retry.js';
import { writeArtifactFile } from '../../artifacts/file-output.js';
import { persistErrorState, persistSpecArtifact, completeSpecStage, loadSession, persistRetryExhaustedState } from '../../session/session.js';
import { runPostSpecWorkflow } from '../../artifacts/workflow-controller.js';
import { runDevPlanLoop } from '../../artifacts/dev-plan-loop.js';
import { createProvider } from '../../providers/factory.js';

vi.mock('../App.js', () => ({
  App: function MockApp() {
    return null;
  },
}));

vi.mock('../RestoredSession.js', () => ({
  RestoredSession: function MockRestoredSession() {
    return null;
  },
}));

vi.mock('../GenerationScreen.js', () => ({
  GenerationScreen: function MockGenerationScreen() {
    return null;
  },
}));

vi.mock('../YesNoPrompt.js', () => ({
  YesNoPrompt: function MockYesNoPrompt() {
    return null;
  },
}));

vi.mock('../../artifacts/workflow-controller.js', () => ({
  runPostSpecWorkflow: vi.fn(() => Promise.resolve({ terminatedAt: 'architecture-decision', finalSession: {} })),
}));

vi.mock('../../artifacts/generator.js', () => ({
  runArtifactPipeline: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../../artifacts/spec-generator.js', () => ({
  SpecGenerator: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../artifacts/file-output.js', () => ({
  ensureDocsDir: vi.fn(() => '/tmp/docs'),
  generateFilename: vi.fn(() => 'project-spec.md'),
  resolveOutputPath: vi.fn(() => '/tmp/docs/project-spec.md'),
  sanitizeFilename: vi.fn((name: string) => name),
  writeArtifactFile: vi.fn(),
}));

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  }),
}));

vi.mock('../../session/session.js', () => {
  const base = {
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: false,
    stage: 'architecture',
    transcript: [],
  };
  return {
    loadSession: vi.fn(() => base),
    persistErrorState: vi.fn(),
    persistSpecArtifact: vi.fn(() => base),
    completeSpecStage: vi.fn(() => base),
    persistRetryExhaustedState: vi.fn(() => base),
  };
});

vi.mock('../../providers/factory.js', () => ({
  createProvider: vi.fn(() => ({
    generate: vi.fn(),
    listModels: vi.fn(),
  })),
  supportsModelListing: vi.fn(() => true),
}));

vi.mock('../../interview/controller.js', () => ({
  runInterviewLoop: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../../interview/prompts.js', () => ({
  buildInterviewSystemPrompt: vi.fn(() => 'mock system prompt'),
}));

vi.mock('../../interview/finish-now.js', () => ({
  createFinishNowHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../../interview/model-command.js', () => ({
  createModelHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../../interview/provider-command.js', () => ({
  createProviderHandler: vi.fn(() => vi.fn()),
}));

vi.mock('../../interview/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  RetryExhaustedError: class RetryExhaustedError extends Error {},
}));

vi.mock('../../artifacts/arch-generator.js', () => ({
  ArchGenerator: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../artifacts/dev-plan-loop.js', () => ({
  runDevPlanLoop: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../../artifacts/plan-generator.js', () => ({
  PlanGenerator: vi.fn().mockImplementation(() => ({})),
}));

describe('ScreenController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without throwing given a pending promise', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: new Promise<StartupResult>(() => {}),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing when startup succeeds', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    unmount();
  });

  it('renders without throwing when startup succeeds with resumed session', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({
          success: true,
          message: 'ok',
          sessionId: 'abc-123',
          sessionResolution: 'resumed' as const,
        }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    unmount();
  });

  it('calls process.exit(1) after startup failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: false, message: 'Ollama unreachable' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(exitSpy).toHaveBeenCalledWith(1);
    unmount();
  });

  it('calls process.exit(1) when startup promise rejects', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stream = new PassThrough();
    const rejected = Promise.reject<StartupResult>(new Error('unexpected crash'));
    rejected.catch(() => {});
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: rejected,
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(exitSpy).toHaveBeenCalledWith(1);
    unmount();
  });
});

describe('ScreenController write failure handling', () => {
  const mockSession = {
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: false,
    stage: 'interview' as const,
    transcript: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createProvider).mockReturnValue({ generate: vi.fn(), listModels: vi.fn() });
    vi.mocked(loadSession).mockReturnValue(mockSession);
    vi.mocked(persistSpecArtifact).mockReturnValue(mockSession);
    vi.mocked(completeSpecStage).mockReturnValue(mockSession);
    vi.mocked(runPostSpecWorkflow).mockResolvedValue({ terminatedAt: 'architecture-decision' as const, finalSession: mockSession });
  });

  it('persists error state to session when file write fails', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockResolvedValue({
      session: mockSession,
      result: { type: 'spec', content: '# Spec' },
    });
    vi.mocked(writeArtifactFile).mockImplementation(() => {
      throw new Error('EACCES: permission denied, open \'/tmp/docs/project-spec.md\'');
    });

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(persistErrorState).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc-123' }),
      expect.stringContaining('File write failed'),
    );

    unmount();
  });

  it('does not persist spec artifact when file write fails', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockResolvedValue({
      session: mockSession,
      result: { type: 'spec', content: '# Spec' },
    });
    vi.mocked(writeArtifactFile).mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(persistSpecArtifact).not.toHaveBeenCalled();

    unmount();
  });

  it('calls completeSpecStage after successful spec generation', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockResolvedValue({
      session: mockSession,
      result: { type: 'spec', content: '# Spec' },
    });
    vi.mocked(persistSpecArtifact).mockReturnValue({ ...mockSession, specArtifact: { content: '# Spec', filePath: '/tmp/docs/project-spec.md', generated: true } });

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(completeSpecStage).toHaveBeenCalled();

    unmount();
  });

  it('does not call completeSpecStage when file write fails', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockResolvedValue({
      session: mockSession,
      result: { type: 'spec', content: '# Spec' },
    });
    vi.mocked(writeArtifactFile).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(completeSpecStage).not.toHaveBeenCalled();

    unmount();
  });
});

describe('ScreenController retry exhaustion handling', () => {
  const mockSession = {
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: false,
    stage: 'interview' as const,
    transcript: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createProvider).mockReturnValue({ generate: vi.fn(), listModels: vi.fn() });
    vi.mocked(loadSession).mockReturnValue(mockSession);
    vi.mocked(persistSpecArtifact).mockReturnValue(mockSession);
    vi.mocked(completeSpecStage).mockReturnValue(mockSession);
    vi.mocked(persistRetryExhaustedState).mockReturnValue(mockSession);
  });

  it('calls persistRetryExhaustedState when RetryExhaustedError is thrown in pipeline', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockRejectedValue(new RetryExhaustedError(new Error('Model request failed'), 5));

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(persistRetryExhaustedState).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc-123' }),
    );

    unmount();
  });

  it('does not call persistErrorState when RetryExhaustedError is thrown in pipeline', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(mockSession);
    vi.mocked(runArtifactPipeline).mockRejectedValue(new RetryExhaustedError(new Error('Model request failed'), 5));

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(persistErrorState).not.toHaveBeenCalled();

    unmount();
  });
});

describe('ScreenController codex-cli provider', () => {
  const codexSession = {
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: false,
    stage: 'interview' as const,
    provider: 'codex-cli' as const,
    transcript: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createProvider).mockReturnValue({ generate: vi.fn(), listModels: vi.fn() });
    vi.mocked(loadSession).mockReturnValue(codexSession);
    vi.mocked(persistSpecArtifact).mockReturnValue(codexSession);
    vi.mocked(completeSpecStage).mockReturnValue(codexSession);
    vi.mocked(runPostSpecWorkflow).mockResolvedValue({ terminatedAt: 'architecture-decision' as const, finalSession: codexSession });
  });

  it('constructs provider via factory with codex-cli when session provider is codex-cli', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(createProvider).toHaveBeenCalledWith('codex-cli', expect.anything());

    unmount();
  });

  it('starts interview loop with the codex-cli provider instance', async () => {
    const mockProvider = { generate: vi.fn(() => new Promise(() => {})) };
    vi.mocked(createProvider).mockReturnValue(mockProvider);

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(runInterviewLoop).toHaveBeenCalled();

    unmount();
  });

  it('runs full artifact pipeline with codex-cli provider', async () => {
    vi.mocked(runInterviewLoop).mockResolvedValue(codexSession);
    vi.mocked(runArtifactPipeline).mockResolvedValue({
      session: codexSession,
      result: { type: 'spec', content: '# Spec' },
    });
    vi.mocked(persistSpecArtifact).mockReturnValue({ ...codexSession, specArtifact: { content: '# Spec', filePath: '/tmp/docs/spec.md', generated: true } });

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(runArtifactPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex-cli' }),
      expect.anything(),
      expect.anything(),
      'spec',
    );
    expect(completeSpecStage).toHaveBeenCalled();

    unmount();
  });

  it('resumes dev-plan loop using codex-cli provider from session', async () => {
    const devPlanCodexSession = {
      ...codexSession,
      completed: true,
      stage: 'dev-plans' as const,
      devPlansDecision: true,
    };
    vi.mocked(loadSession).mockReturnValue(devPlanCodexSession);
    vi.mocked(runDevPlanLoop).mockReturnValue(new Promise(() => {}));

    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({
          success: true,
          message: 'ok',
          sessionId: 'abc-123',
          sessionStage: 'dev-plans' as const,
        }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(createProvider).toHaveBeenCalledWith('codex-cli', expect.anything());
    expect(runDevPlanLoop).toHaveBeenCalledWith(
      devPlanCodexSession,
      expect.anything(),
      expect.objectContaining({ onPhaseStart: expect.any(Function), onPhaseComplete: expect.any(Function) }),
    );

    unmount();
  });
});

describe('ScreenController dev-plans resume', () => {
  const devPlanSession = {
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: true,
    stage: 'dev-plans' as const,
    devPlansDecision: true,
    transcript: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createProvider).mockReturnValue({ generate: vi.fn(), listModels: vi.fn() });
    vi.mocked(loadSession).mockReturnValue(devPlanSession);
    vi.mocked(runDevPlanLoop).mockReturnValue(new Promise(() => {}));
  });

  it('does not start the interview loop when sessionStage is dev-plans', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({
          success: true,
          message: 'ok',
          sessionId: 'abc-123',
          sessionResolution: 'resumed' as const,
          sessionStage: 'dev-plans' as const,
        }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    // Simulate user clicking continue on the RestoredSession screen by waiting for effects
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(runInterviewLoop).not.toHaveBeenCalled();

    unmount();
  });

  it('calls runDevPlanLoop when sessionStage is dev-plans and user continues', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({
          success: true,
          message: 'ok',
          sessionId: 'abc-123',
          sessionStage: 'dev-plans' as const,
        }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(runDevPlanLoop).toHaveBeenCalledWith(
      devPlanSession,
      expect.anything(),
      expect.objectContaining({
        onPhaseStart: expect.any(Function),
        onPhaseComplete: expect.any(Function),
      }),
    );

    unmount();
  });
});
