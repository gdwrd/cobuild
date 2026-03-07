import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  createProviderHandler,
  PROVIDER_MESSAGE,
  OLLAMA_PROVIDER_MESSAGE,
  CODEX_CLI_PROVIDER_MESSAGE,
} from '../provider-command.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createProviderHandler (Ollama)', () => {
  it('returns handled=true', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler([]);
    expect(result.handled).toBe(true);
  });

  it('returns continueInterview=true', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler([]);
    expect(result.continueInterview).toBe(true);
  });

  it('returns OLLAMA_PROVIDER_MESSAGE for Ollama', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler([]);
    expect(result.message).toBe(OLLAMA_PROVIDER_MESSAGE);
  });

  it('message mentions Ollama', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler([]);
    expect(result.message).toContain('Ollama');
  });

  it('message suggests /model for Ollama', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler([]);
    expect(result.message).toContain('/model');
  });

  it('defaults to Ollama when no provider specified', async () => {
    const handler = createProviderHandler();
    const result = await handler([]);
    expect(result.message).toBe(OLLAMA_PROVIDER_MESSAGE);
  });

  it('PROVIDER_MESSAGE equals OLLAMA_PROVIDER_MESSAGE for backward compat', () => {
    expect(PROVIDER_MESSAGE).toBe(OLLAMA_PROVIDER_MESSAGE);
  });

  it('ignores any args passed', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler(['some', 'args']);
    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });
});

describe('createProviderHandler (Codex CLI)', () => {
  it('returns handled=true', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.handled).toBe(true);
  });

  it('returns continueInterview=true', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.continueInterview).toBe(true);
  });

  it('returns CODEX_CLI_PROVIDER_MESSAGE for codex-cli', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.message).toBe(CODEX_CLI_PROVIDER_MESSAGE);
  });

  it('message mentions Codex CLI', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.message).toContain('Codex CLI');
  });

  it('message mentions model selection is managed externally', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.message).toContain('managed by Codex');
  });

  it('message mentions /model is not available', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler([]);
    expect(result.message).toContain('/model');
  });

  it('ignores any args passed', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler(['some', 'args']);
    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });
});
