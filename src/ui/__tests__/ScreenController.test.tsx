import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ScreenController } from '../ScreenController.js';
import type { StartupResult } from '../../cli/app-shell.js';
import { runInterviewLoop } from '../../interview/controller.js';
import { runArtifactPipeline } from '../../artifacts/generator.js';
import { writeArtifactFile } from '../../artifacts/file-output.js';
import { persistErrorState, persistSpecArtifact, loadSession } from '../../session/session.js';

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

vi.mock('../../session/session.js', () => ({
  loadSession: vi.fn(() => ({
    id: 'abc-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp',
    completed: false,
    stage: 'interview',
    transcript: [],
  })),
  persistErrorState: vi.fn(),
  persistSpecArtifact: vi.fn(),
}));

vi.mock('../../providers/ollama.js', () => ({
  OllamaProvider: vi.fn().mockImplementation(() => ({
    generate: vi.fn(),
    listModels: vi.fn(),
  })),
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
    vi.mocked(loadSession).mockReturnValue(mockSession);
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
});
