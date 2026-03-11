import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
}));

vi.mock('../../settings/settings.js', () => ({
  loadSettings: vi.fn(() => ({ schemaVersion: 1 })),
  saveSettings: vi.fn(),
}));

import { saveSession } from '../../session/session.js';
import { loadSettings, saveSettings } from '../../settings/settings.js';
import { createModelHandler, MODEL_NOT_SUPPORTED_MESSAGE } from '../model-command.js';
import type { ModelHandlerOptions, ModelLister } from '../model-command.js';
import type { Session } from '../../session/session.js';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
  transcript: [],
  ...overrides,
});

const makeLister = (models: string[]): ModelLister => ({
  listModels: vi.fn(async () => models),
});

const makeOptions = (
  session: Session,
  lister: ModelLister,
  overrides: Partial<ModelHandlerOptions> = {},
): ModelHandlerOptions => {
  let currentSession = session;
  return {
    getSession: () => currentSession,
    onSessionUpdate: vi.fn((s) => {
      currentSession = s;
    }),
    modelLister: lister,
    onSelectModel: vi.fn(async () => null),
    supportsModelListing: true,
    ...overrides,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveSession).mockImplementation(() => {});
  vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1 });
});

describe('createModelHandler', () => {
  it('calls listModels to get available models', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3', 'mistral']);
    const options = makeOptions(session, lister);
    const handler = createModelHandler(options);

    await handler([]);

    expect(lister.listModels).toHaveBeenCalledOnce();
  });

  it('supports manually setting a model without listing models', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister);
    const handler = createModelHandler(options);

    const result = await handler(['llama3.2']);

    expect(lister.listModels).not.toHaveBeenCalled();
    expect(saveSession).toHaveBeenCalledOnce();
    expect(result.message).toBe('Model set to llama3.2.');
  });

  it('returns handled=true and continueInterview=true when no models available', async () => {
    const session = makeSession();
    const lister = makeLister([]);
    const options = makeOptions(session, lister);
    const handler = createModelHandler(options);

    const result = await handler([]);

    expect(result).toEqual({
      handled: true,
      continueInterview: true,
      message: 'No models available.',
    });
  });

  it('does not call onSelectModel when no models available', async () => {
    const session = makeSession();
    const lister = makeLister([]);
    const onSelectModel = vi.fn(async () => null);
    const options = makeOptions(session, lister, { onSelectModel });
    const handler = createModelHandler(options);

    await handler([]);

    expect(onSelectModel).not.toHaveBeenCalled();
  });

  it('calls onSelectModel with the list of models', async () => {
    const session = makeSession();
    const models = ['llama3', 'mistral', 'codellama'];
    const lister = makeLister(models);
    const onSelectModel = vi.fn(async () => null);
    const options = makeOptions(session, lister, { onSelectModel });
    const handler = createModelHandler(options);

    await handler([]);

    expect(onSelectModel).toHaveBeenCalledWith(models);
  });

  it('returns a helpful manual override message when listModels fails', async () => {
    const session = makeSession();
    const options = makeOptions(session, {
      listModels: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    });
    const handler = createModelHandler(options);

    const result = await handler([]);

    expect(result.message).toContain('Unable to list models right now');
    expect(result.message).toContain('/model <name>');
  });

  it('returns handled=true continueInterview=true when user cancels selection', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const onSelectModel = vi.fn(async () => null);
    const options = makeOptions(session, lister, { onSelectModel });
    const handler = createModelHandler(options);

    const result = await handler([]);

    expect(result).toEqual({ handled: true, continueInterview: true });
  });

  it('does not save session when user cancels selection', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, { onSelectModel: vi.fn(async () => null) });
    const handler = createModelHandler(options);

    await handler([]);

    expect(saveSession).not.toHaveBeenCalled();
  });

  it('persists selected model in session', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3', 'mistral']);
    const options = makeOptions(session, lister, {
      onSelectModel: vi.fn(async () => 'mistral'),
    });
    const handler = createModelHandler(options);

    await handler([]);

    expect(saveSession).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveSession).mock.calls[0][0];
    expect(saved.model).toBe('mistral');
  });

  it('does not modify transcript when model is selected', async () => {
    const session = makeSession({
      transcript: [{ role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' }],
    });
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, {
      onSelectModel: vi.fn(async () => 'llama3'),
    });
    const handler = createModelHandler(options);

    await handler([]);

    const saved = vi.mocked(saveSession).mock.calls[0][0];
    expect(saved.transcript).toEqual(session.transcript);
  });

  it('calls onSessionUpdate with updated session after model selection', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const onSessionUpdate = vi.fn();
    const options = makeOptions(session, lister, {
      onSelectModel: vi.fn(async () => 'llama3'),
      onSessionUpdate,
    });
    const handler = createModelHandler(options);

    await handler([]);

    expect(onSessionUpdate).toHaveBeenCalledOnce();
    const updated = onSessionUpdate.mock.calls[0][0];
    expect(updated.model).toBe('llama3');
  });

  it('returns handled=true continueInterview=true after successful model selection', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, {
      onSelectModel: vi.fn(async () => 'llama3'),
    });
    const handler = createModelHandler(options);

    const result = await handler([]);

    expect(result).toEqual({ handled: true, continueInterview: true });
  });

  it('uses current session from getSession at time of invocation', async () => {
    const initial = makeSession();
    let currentSession = initial;
    const lister = makeLister(['llama3']);
    const options: ModelHandlerOptions = {
      getSession: () => currentSession,
      onSessionUpdate: vi.fn((s) => { currentSession = s; }),
      modelLister: lister,
      onSelectModel: vi.fn(async () => 'llama3'),
      supportsModelListing: true,
    };
    const handler = createModelHandler(options);

    // Simulate session update before handler is called
    currentSession = makeSession({ id: 'sess-updated' });
    await handler([]);

    const saved = vi.mocked(saveSession).mock.calls[0][0];
    expect(saved.id).toBe('sess-updated');
  });
});

describe('createModelHandler with supportsModelListing=false', () => {
  it('returns handled=true and continueInterview=true', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    const result = await handler([]);

    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });

  it('returns MODEL_NOT_SUPPORTED_MESSAGE', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    const result = await handler([]);

    expect(result.message).toBe(MODEL_NOT_SUPPORTED_MESSAGE);
  });

  it('does not call listModels when supportsModelListing is false', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      modelLister: lister,
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    await handler([]);

    expect(lister.listModels).not.toHaveBeenCalled();
  });

  it('does not call onSelectModel when supportsModelListing is false', async () => {
    const session = makeSession();
    const onSelectModel = vi.fn(async () => null);
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel,
      supportsModelListing: false,
    });

    await handler([]);

    expect(onSelectModel).not.toHaveBeenCalled();
  });

  it('does not save session when supportsModelListing is false', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    await handler([]);

    expect(saveSession).not.toHaveBeenCalled();
  });

  it('message mentions Codex', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    const result = await handler([]);

    expect(result.message).toContain('Codex');
  });
});

describe('createModelHandler global settings persistence', () => {
  it('saves defaultOllamaModel to global settings when model is selected via list', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3', 'mistral']);
    const options = makeOptions(session, lister, {
      onSelectModel: vi.fn(async () => 'mistral'),
    });
    const handler = createModelHandler(options);

    await handler([]);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOllamaModel: 'mistral' }),
    );
  });

  it('saves defaultOllamaModel to global settings when model is set manually', async () => {
    const session = makeSession();
    const lister = makeLister([]);
    const options = makeOptions(session, lister);
    const handler = createModelHandler(options);

    await handler(['llama3.2']);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOllamaModel: 'llama3.2' }),
    );
  });

  it('does not save global settings when user cancels model selection', async () => {
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, { onSelectModel: vi.fn(async () => null) });
    const handler = createModelHandler(options);

    await handler([]);

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('preserves existing settings fields when saving defaultOllamaModel', async () => {
    vi.mocked(loadSettings).mockReturnValue({ schemaVersion: 1, defaultProvider: 'ollama' });
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, { onSelectModel: vi.fn(async () => 'llama3') });
    const handler = createModelHandler(options);

    await handler([]);

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultProvider: 'ollama', defaultOllamaModel: 'llama3' }),
    );
  });

  it('does not throw when saveSettings fails during model selection', async () => {
    vi.mocked(saveSettings).mockImplementationOnce(() => { throw new Error('disk full'); });
    const session = makeSession();
    const lister = makeLister(['llama3']);
    const options = makeOptions(session, lister, { onSelectModel: vi.fn(async () => 'llama3') });
    const handler = createModelHandler(options);

    await expect(handler([])).resolves.toBeDefined();
  });

  it('does not save global settings when supportsModelListing is false', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: false,
    });

    await handler([]);

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('does not throw when saveSettings fails during manual model override', async () => {
    vi.mocked(saveSettings).mockImplementationOnce(() => { throw new Error('disk full'); });
    const session = makeSession();
    const lister = makeLister([]);
    const options = makeOptions(session, lister);
    const handler = createModelHandler(options);

    await expect(handler(['llama3.2'])).resolves.toBeDefined();
  });
});

describe('createModelHandler with missing modelLister', () => {
  it('returns unavailable message when supportsModelListing=true but modelLister not provided', async () => {
    const session = makeSession();
    const handler = createModelHandler({
      getSession: () => session,
      onSessionUpdate: vi.fn(),
      onSelectModel: vi.fn(async () => null),
      supportsModelListing: true,
    });

    const result = await handler([]);

    expect(result).toEqual({
      handled: true,
      continueInterview: true,
      message: 'Model listing is unavailable.',
    });
  });
});
