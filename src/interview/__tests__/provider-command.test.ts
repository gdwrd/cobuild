import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
}));

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../settings/settings.js', () => ({
  loadSettings: vi.fn(() => ({ schemaVersion: 1 })),
  saveSettings: vi.fn(),
}));

import { saveSession } from '../../session/session.js';
import { loadSettings, saveSettings } from '../../settings/settings.js';
import {
  createProviderHandler,
  PROVIDER_MESSAGE,
  OLLAMA_PROVIDER_MESSAGE,
  CODEX_CLI_PROVIDER_MESSAGE,
} from '../provider-command.js';
import type { ProviderHandlerOptions } from '../provider-command.js';
import type { Session } from '../../session/session.js';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
  transcript: [],
  provider: 'ollama',
  ...overrides,
});

const makeOptions = (
  session: Session,
  overrides: Partial<ProviderHandlerOptions> = {},
): ProviderHandlerOptions => {
  let currentSession = session;
  return {
    getSession: () => currentSession,
    onSessionUpdate: vi.fn((updated) => {
      currentSession = updated;
    }),
    checkReadiness: vi.fn(async () => ({ ok: true, message: 'provider is ready' })),
    ...overrides,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1 });
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

  it('returns an error for an unrecognized provider name passed as arg', async () => {
    const handler = createProviderHandler('ollama');
    const result = await handler(['some', 'args']);
    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });

  it('switches providers when a valid provider name is passed', async () => {
    const options = makeOptions(makeSession());
    const handler = createProviderHandler(options);

    const result = await handler(['codex-cli']);

    expect(saveSession).toHaveBeenCalledOnce();
    expect(options.onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex-cli' }),
    );
    expect(result.message).toContain('Switched provider to codex-cli');
  });

  it('returns usage guidance for an unknown provider name', async () => {
    const handler = createProviderHandler(makeOptions(makeSession()));

    const result = await handler(['anthropic']);

    expect(result.message).toContain('Unknown provider');
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('does not inject llama3 when switching from codex-cli to ollama with no saved model', async () => {
    const session = makeSession({ provider: 'codex-cli', model: undefined });
    const options = makeOptions(session);
    const handler = createProviderHandler(options);

    await handler(['ollama']);

    expect(options.onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ollama', model: undefined }),
    );
  });

  it('preserves saved model when switching to ollama', async () => {
    const session = makeSession({ provider: 'codex-cli', model: 'mistral' });
    const options = makeOptions(session);
    const handler = createProviderHandler(options);

    await handler(['ollama']);

    expect(options.onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ollama', model: 'mistral' }),
    );
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

  it('returns an error for an unrecognized provider name passed as arg', async () => {
    const handler = createProviderHandler('codex-cli');
    const result = await handler(['some', 'args']);
    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });

  it('includes readiness details when available', async () => {
    const handler = createProviderHandler(makeOptions(makeSession({ provider: 'codex-cli' }), {
      checkReadiness: vi.fn(async () => ({ ok: false, message: 'codex binary not found' })),
    }));

    const result = await handler([]);

    expect(result.message).toContain('Availability: unavailable');
    expect(result.message).toContain('codex binary not found');
  });
});

describe('createProviderHandler global settings persistence', () => {
  it('saves defaultProvider to global settings when switching providers', async () => {
    const options = makeOptions(makeSession());
    const handler = createProviderHandler(options);

    await handler(['codex-cli']);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'codex-cli' }),
    );
  });

  it('does not save global settings when provider is unchanged', async () => {
    const options = makeOptions(makeSession({ provider: 'ollama' }));
    const handler = createProviderHandler(options);

    await handler(['ollama']);

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('does not save global settings when no provider arg is given', async () => {
    const options = makeOptions(makeSession());
    const handler = createProviderHandler(options);

    await handler([]);

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('preserves existing settings fields when saving defaultProvider', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultOllamaModel: 'llama3' });
    const options = makeOptions(makeSession());
    const handler = createProviderHandler(options);

    await handler(['codex-cli']);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOllamaModel: 'llama3', defaultProvider: 'codex-cli' }),
    );
  });

  it('does not throw when saveSettings fails', async () => {
    vi.mocked(saveSettings).mockImplementationOnce(() => { throw new Error('disk full'); });
    const options = makeOptions(makeSession());
    const handler = createProviderHandler(options);

    await expect(handler(['codex-cli'])).resolves.toBeDefined();
  });

  it('calls onSettingsUpdate with saved settings after switching providers', async () => {
    const onSettingsUpdate = vi.fn();
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultOllamaModel: 'llama3' });
    const options = makeOptions(makeSession(), { onSettingsUpdate });
    const handler = createProviderHandler(options);

    await handler(['codex-cli']);

    expect(onSettingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'codex-cli', defaultOllamaModel: 'llama3' }),
    );
  });

  it('does not call onSettingsUpdate when provider is unchanged', async () => {
    const onSettingsUpdate = vi.fn();
    const options = makeOptions(makeSession({ provider: 'ollama' }), { onSettingsUpdate });
    const handler = createProviderHandler(options);

    await handler(['ollama']);

    expect(onSettingsUpdate).not.toHaveBeenCalled();
  });

  it('does not call onSettingsUpdate when saveSettings fails', async () => {
    const onSettingsUpdate = vi.fn();
    vi.mocked(saveSettings).mockImplementationOnce(() => { throw new Error('disk full'); });
    const options = makeOptions(makeSession(), { onSettingsUpdate });
    const handler = createProviderHandler(options);

    await handler(['codex-cli']);

    expect(onSettingsUpdate).not.toHaveBeenCalled();
  });
});
