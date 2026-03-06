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
  })),
}));

import { checkTTY, checkOllama } from '../../validation/env.js';

describe('runStartup', () => {
  beforeEach(() => {
    vi.mocked(checkTTY).mockReturnValue({ ok: true, message: 'terminal is interactive' });
    vi.mocked(checkOllama).mockResolvedValue({ ok: true, message: 'Ollama is reachable at http://localhost:11434' });
  });

  it('returns success when validations pass', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
    expect(result.message).toBeTruthy();
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
});
