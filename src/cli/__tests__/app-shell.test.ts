import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStartup } from '../app-shell.js';

vi.mock('../../validation/env.js', () => ({
  checkTTY: vi.fn(() => ({ ok: true, message: 'terminal is interactive' })),
  checkOllama: vi.fn(async () => ({ ok: true, message: 'Ollama is reachable at http://localhost:11434' })),
}));

vi.mock('../../session/session.js', () => ({
  createAndSaveSession: vi.fn(() => ({
    id: 'mock-session-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: false,
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

import { checkTTY, checkOllama } from '../../validation/env.js';
import { bootstrapDirectories } from '../../fs/bootstrap.js';
import { createAndSaveSession, findLatestByWorkingDirectory } from '../../session/session.js';

const mockNewSession = {
  id: 'mock-session-id',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
};

describe('runStartup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkTTY).mockReturnValue({ ok: true, message: 'terminal is interactive' });
    vi.mocked(checkOllama).mockResolvedValue({ ok: true, message: 'Ollama is reachable at http://localhost:11434' });
    vi.mocked(bootstrapDirectories).mockReturnValue({
      ok: true,
      cobuildDir: '/home/testuser/.cobuild',
      message: 'directories ready: /home/testuser/.cobuild',
    });
    vi.mocked(createAndSaveSession).mockReturnValue(mockNewSession);
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue(null);
  });

  it('returns success when validations pass and no existing session', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.sessionId).toBe('mock-session-id');
    expect(result.sessionResolution).toBe('new');
  });

  it('resumes existing incomplete session when newSession=false', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'existing-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: false,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('existing-session-id');
    expect(result.sessionResolution).toBe('resumed');
    expect(vi.mocked(createAndSaveSession)).not.toHaveBeenCalled();
  });

  it('creates new session when existing session is completed', async () => {
    vi.mocked(findLatestByWorkingDirectory).mockReturnValue({
      id: 'completed-session-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: process.cwd(),
      completed: true,
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
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
    });
    const result = await runStartup({ newSession: true, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('mock-session-id');
    expect(result.sessionResolution).toBe('new');
    expect(vi.mocked(findLatestByWorkingDirectory)).not.toHaveBeenCalled();
  });

  it('returns success with newSession=true', async () => {
    const result = await runStartup({ newSession: true, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
  });

  it('returns success with verbose=true', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: true });
    expect(result.success).toBe(true);
  });

  it('returns failure when TTY check fails', async () => {
    vi.mocked(checkTTY).mockReturnValue({
      ok: false,
      message: 'cobuild requires an interactive terminal.',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/interactive terminal/i);
  });

  it('returns failure when Ollama check fails', async () => {
    vi.mocked(checkOllama).mockResolvedValue({
      ok: false,
      message: 'Ollama is not reachable at http://localhost:11434 (connection refused).',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not reachable/i);
  });

  it('returns failure when directory bootstrap fails', async () => {
    vi.mocked(bootstrapDirectories).mockReturnValue({
      ok: false,
      cobuildDir: '/home/testuser/.cobuild',
      message: 'failed to create directories: permission denied',
    });
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/permission denied/i);
  });
});
