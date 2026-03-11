import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStartup } from '../app-shell.js';

vi.mock('../../validation/env.js', () => ({
  checkTTY: vi.fn(() => ({ ok: true, message: 'terminal is interactive' })),
  checkProviderReadiness: vi.fn(async () => ({ ok: true, message: 'provider is ready' })),
}));

vi.mock('../../session/session.js', () => ({
  createAndSaveSession: vi.fn(() => ({
    id: 'mock-session-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: false,
    transcript: [],
    provider: 'ollama',
  })),
  findLatestByWorkingDirectory: vi.fn(() => null),
}));

vi.mock('../../fs/bootstrap.js', () => ({
  bootstrapDirectories: vi.fn(() => ({
    ok: true,
    cobuildDir: '/home/testuser/.cobuild',
    message: 'directories ready: /home/testuser/.cobuild',
  })),
}));

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() }),
}));

vi.mock('../../settings/settings.js', () => ({
  loadSettings: vi.fn(() => ({ schemaVersion: 1 })),
}));

import { checkTTY, checkProviderReadiness } from '../../validation/env.js';
import { bootstrapDirectories } from '../../fs/bootstrap.js';
import { createAndSaveSession, findLatestByWorkingDirectory } from '../../session/session.js';
import { loadSettings } from '../../settings/settings.js';

const mockNewSession = {
  id: 'mock-session-id',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
  transcript: [],
  provider: 'ollama' as const,
};

describe('runStartup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkTTY).mockReturnValue({ ok: true, message: 'terminal is interactive' });
    vi.mocked(checkProviderReadiness).mockResolvedValue({ ok: true, message: 'provider is ready' });
    vi.mocked(bootstrapDirectories).mockReturnValue({
      ok: true,
      cobuildDir: '/home/testuser/.cobuild',
      message: 'directories ready: /home/testuser/.cobuild',
    });
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1 });
    vi.mocked(createAndSaveSession).mockReturnValue(mockNewSession);
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue(null);
  });

  it('returns success when validations pass and no existing session', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.sessionId).toBe('mock-session-id');
    expect(result.sessionResolution).toBe('new');
  });

  it('calls checkProviderReadiness with ollama for a new ollama session', async () => {
    await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(vi.mocked(checkProviderReadiness)).toHaveBeenCalledWith('ollama');
  });

  it('calls checkProviderReadiness with codex-cli for a new codex-cli session', async () => {
    await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'codex-cli' as const, providerExplicit: true });
    expect(vi.mocked(checkProviderReadiness)).toHaveBeenCalledWith('codex-cli');
  });

  it('resumes existing incomplete session when newSession=false', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'existing-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'ollama' as const,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('existing-session-id');
    expect(result.sessionResolution).toBe('resumed');
    expect(vi.mocked(createAndSaveSession)).not.toHaveBeenCalled();
  });

  it('uses the provider from the resumed session for the readiness check', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'codex-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'codex-cli' as const,
    });
    // config says ollama but the session says codex-cli — must use codex-cli
    await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(vi.mocked(checkProviderReadiness)).toHaveBeenCalledWith('codex-cli');
  });

  it('resumes a codex-cli session successfully', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'codex-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'codex-cli' as const,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('codex-session-id');
    expect(result.sessionResolution).toBe('resumed');
  });

  it('treats resumed sessions with missing provider as ollama', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'legacy-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      // no provider field — legacy session
    });
    await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(vi.mocked(checkProviderReadiness)).toHaveBeenCalledWith('ollama');
  });

  it('creates new session when existing session is completed', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'completed-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: true,
      transcript: [],
      provider: 'ollama' as const,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('mock-session-id');
    expect(result.sessionResolution).toBe('new');
  });

  it('forces new session when newSession=true even with existing session', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'existing-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'ollama' as const,
    });
    const result = await runStartup({ newSession: true, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('mock-session-id');
    expect(result.sessionResolution).toBe('new');
    expect(vi.mocked(findLatestByWorkingDirectory)).not.toHaveBeenCalled();
  });

  it('returns success with newSession=true', async () => {
    const result = await runStartup({ newSession: true, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
  });

  it('returns success with verbose=true', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: true, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
  });

  it('returns failure when TTY check fails', async () => {
    vi.mocked(checkTTY).mockReturnValue({
      ok: false,
      message: 'cobuild requires an interactive terminal.',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/interactive terminal/i);
  });

  it('returns success with a startup notice when ollama readiness check fails', async () => {
    vi.mocked(checkProviderReadiness).mockResolvedValue({
      ok: false,
      message: 'Ollama is not reachable at http://localhost:11434 (connection refused).',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.startupNotice).toMatch(/not reachable/i);
    expect(result.providerStatuses).toEqual([
      expect.objectContaining({ provider: 'ollama', ok: false }),
      expect.objectContaining({ provider: 'codex-cli', ok: false }),
    ]);
  });

  it('returns success with a startup notice when codex-cli readiness check fails for a new session', async () => {
    vi.mocked(checkProviderReadiness)
      .mockResolvedValueOnce({ ok: true, message: 'Ollama is reachable at http://localhost:11434' })
      .mockResolvedValueOnce({
        ok: false,
        message: 'codex CLI is not available (codex binary not found on PATH). Install Codex CLI and ensure it is on your PATH.',
      });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'codex-cli' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.startupNotice).toMatch(/Active provider codex-cli is not available yet/i);
  });

  it('returns success with a startup notice when codex-cli readiness check fails for a resumed codex-cli session', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'codex-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'codex-cli' as const,
    });
    vi.mocked(checkProviderReadiness).mockResolvedValue({
      ok: false,
      message: 'codex CLI is not available (codex binary not found on PATH). Install Codex CLI and ensure it is on your PATH.',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.startupNotice).toMatch(/codex CLI is not available/i);
  });

  it('returns failure when directory bootstrap fails', async () => {
    vi.mocked(bootstrapDirectories).mockReturnValue({
      ok: false,
      cobuildDir: '/home/testuser/.cobuild',
      message: 'failed to create directories: permission denied',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/permission denied/i);
  });

  it('emits provider step actionHint when active provider is down but alternative is available', async () => {
    vi.mocked(checkProviderReadiness)
      .mockResolvedValueOnce({ ok: false, message: 'ollama not reachable' })
      .mockResolvedValueOnce({ ok: true, message: 'codex-cli ready' });
    const steps: import('../app-shell.js').StartupStep[] = [];
    const onProgress = vi.fn((s: ReadonlyArray<import('../app-shell.js').StartupStep>) => {
      steps.splice(0, steps.length, ...s);
    });
    const result = await runStartup(
      { newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true },
      onProgress,
    );
    expect(result.success).toBe(true);
    const providerStep = steps.find((s) => s.id === 'provider');
    expect(providerStep?.status).toBe('warning');
    expect(providerStep?.actionHint).toMatch(/codex-cli is available/i);
    expect(providerStep?.actionHint).toMatch(/--new-session --provider codex-cli/);
  });

  it('does not emit actionHint when active provider is down and no alternative is available', async () => {
    vi.mocked(checkProviderReadiness).mockResolvedValue({ ok: false, message: 'not reachable' });
    const steps: import('../app-shell.js').StartupStep[] = [];
    const onProgress = vi.fn((s: ReadonlyArray<import('../app-shell.js').StartupStep>) => {
      steps.splice(0, steps.length, ...s);
    });
    await runStartup(
      { newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true },
      onProgress,
    );
    const providerStep = steps.find((s) => s.id === 'provider');
    expect(providerStep?.actionHint).toBeUndefined();
  });

  it('emits session step detail "new session" for a fresh session', async () => {
    const steps: import('../app-shell.js').StartupStep[] = [];
    const onProgress = vi.fn((s: ReadonlyArray<import('../app-shell.js').StartupStep>) => {
      steps.splice(0, steps.length, ...s);
    });
    await runStartup(
      { newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true },
      onProgress,
    );
    const sessionStep = steps.find((s) => s.id === 'session');
    expect(sessionStep?.detail).toBe('new session');
  });

  it('emits session step detail with human-readable stage label for resumed session', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'resumed-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'ollama' as const,
      stage: 'spec',
    });
    const steps: import('../app-shell.js').StartupStep[] = [];
    const onProgress = vi.fn((s: ReadonlyArray<import('../app-shell.js').StartupStep>) => {
      steps.splice(0, steps.length, ...s);
    });
    await runStartup(
      { newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true },
      onProgress,
    );
    const sessionStep = steps.find((s) => s.id === 'session');
    expect(sessionStep?.detail).toBe('resumed · spec generation');
  });

  it('emits session step detail with dev-plans stage label for resumed dev-plans session', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'resumed-devplans-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'ollama' as const,
      stage: 'dev-plans',
      devPlansComplete: false,
    });
    const steps: import('../app-shell.js').StartupStep[] = [];
    const onProgress = vi.fn((s: ReadonlyArray<import('../app-shell.js').StartupStep>) => {
      steps.splice(0, steps.length, ...s);
    });
    await runStartup(
      { newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true },
      onProgress,
    );
    const sessionStep = steps.find((s) => s.id === 'session');
    expect(sessionStep?.detail).toBe('resumed · dev plan generation');
  });

  it('uses global settings defaultProvider for new session when --provider is not explicit', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultProvider: 'codex-cli' });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: false });
    expect(result.success).toBe(true);
    expect(result.activeProvider).toBe('codex-cli');
    expect(vi.mocked(createAndSaveSession)).toHaveBeenCalledWith('codex-cli');
  });

  it('explicit --provider overrides global settings defaultProvider', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultProvider: 'codex-cli' });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: true });
    expect(result.success).toBe(true);
    expect(result.activeProvider).toBe('ollama');
    expect(vi.mocked(createAndSaveSession)).toHaveBeenCalledWith('ollama');
  });

  it('resumed session provider overrides global settings defaultProvider', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultProvider: 'codex-cli' });
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'ollama-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
      transcript: [],
      provider: 'ollama' as const,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: false });
    expect(result.success).toBe(true);
    expect(result.activeProvider).toBe('ollama');
    expect(vi.mocked(createAndSaveSession)).not.toHaveBeenCalled();
  });

  it('falls back to ollama when no global settings and no explicit provider', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1 });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: false });
    expect(result.success).toBe(true);
    expect(result.activeProvider).toBe('ollama');
    expect(vi.mocked(createAndSaveSession)).toHaveBeenCalledWith('ollama');
  });

  it('returns globalSettings in the result', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultProvider: 'codex-cli', defaultOllamaModel: 'llama3' });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false, provider: 'ollama' as const, providerExplicit: false });
    expect(result.success).toBe(true);
    expect(result.globalSettings).toEqual({ schemaVersion: 1, defaultProvider: 'codex-cli', defaultOllamaModel: 'llama3' });
  });
});
