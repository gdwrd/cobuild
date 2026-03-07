import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:fs');
vi.mock('node:os');
vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { createSession } from '../../session/session.js';
import { runInterviewLoop, COMPLETION_MARKER } from '../controller.js';
import { createFinishNowHandler } from '../finish-now.js';
import { createModelHandler } from '../model-command.js';
import { createProviderHandler, PROVIDER_MESSAGE } from '../provider-command.js';
import { withRetry, RetryExhaustedError } from '../retry.js';
import type { ModelProvider } from '../controller.js';
import type { Session } from '../../session/session.js';

const fsMock = vi.mocked(fs);
const osMock = vi.mocked(os);

function makeSession(extra: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: false,
    stage: 'interview',
    transcript: [],
    ...extra,
  };
}

function parseSaves(): Session[] {
  return fsMock.writeFileSync.mock.calls.map((call) => JSON.parse(call[1] as string) as Session);
}

beforeEach(() => {
  vi.resetAllMocks();
  osMock.homedir.mockReturnValue('/home/testuser');
  fsMock.writeFileSync.mockImplementation(() => {});
  fsMock.renameSync.mockImplementation(() => {});
});

describe('new session interview start', () => {
  it('fires initial model turn before asking user for input', async () => {
    const session = makeSession();
    let providerCallCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        providerCallCount++;
        if (providerCallCount === 1) return 'What is your project idea?';
        return `Thanks for sharing! ${COMPLETION_MARKER}`;
      }),
    };
    const onUserInput = vi.fn().mockResolvedValue('A todo app');
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(
      session,
      provider,
      'You are an interviewer.',
      onUserInput,
      onAssistantResponse,
    );

    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(onUserInput).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledTimes(2);
    expect(onAssistantResponse).toHaveBeenNthCalledWith(1, 'What is your project idea?', false);
    expect(onAssistantResponse).toHaveBeenNthCalledWith(2, 'Thanks for sharing!', true);
    expect(finalSession.completed).toBe(true);
    expect(finalSession.stage).toBe('spec');
  });

  it('creates a new session with empty transcript and starts with model question', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const session = createSession();
    expect(session.transcript).toHaveLength(0);
    expect(session.completed).toBe(false);
    expect(session.stage).toBe('interview');

    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`One question only. ${COMPLETION_MARKER}`),
    };
    const onUserInput = vi.fn().mockResolvedValue('answer');
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(
      session,
      provider,
      'system',
      onUserInput,
      onAssistantResponse,
    );

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(onUserInput).not.toHaveBeenCalled();
    expect(finalSession.completed).toBe(true);
  });
});

describe('restored session continuation', () => {
  it('resumes from existing transcript without firing initial model turn', async () => {
    // Transcript ends with assistant (normal resume: model asked a question, waiting for user)
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'What is your project?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Great, I have enough info! ${COMPLETION_MARKER}`),
    };
    const onUserInput = vi.fn().mockResolvedValue('A todo app.');
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(
      session,
      provider,
      'system',
      onUserInput,
      onAssistantResponse,
    );

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(onUserInput).toHaveBeenCalledTimes(1);
    expect(finalSession.completed).toBe(true);
  });

  it('sends existing transcript messages to model when resuming', async () => {
    // Transcript ends with assistant, so resume asks for user input before calling model
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'What is your project?', timestamp: '2026-01-01T00:00:00.000Z' },
        { role: 'user', content: 'A todo app.', timestamp: '2026-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'Tell me more.', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Done! ${COMPLETION_MARKER}`),
    };
    const onUserInput = vi.fn().mockResolvedValue('extra detail');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    const modelMessages = vi.mocked(provider.generate).mock.calls[0][0];
    expect(modelMessages.some((m) => m.content === 'What is your project?')).toBe(true);
    expect(modelMessages.some((m) => m.content === 'A todo app.')).toBe(true);
    expect(modelMessages.some((m) => m.content === 'extra detail')).toBe(true);
  });
});

describe('/finish-now behavior', () => {
  it('terminates interview and marks session completed with finishedEarly=true', async () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`I have enough info. ${COMPLETION_MARKER}`),
    };
    const sessionRef = { current: session };
    const onResponse = vi.fn(async () => {});
    const finishNowHandler = createFinishNowHandler({
      getSession: () => sessionRef.current,
      onSessionUpdate: (s) => {
        sessionRef.current = s;
      },
      provider,
      systemPrompt: 'You are an interviewer.',
      onResponse,
    });

    const onUserInput = vi.fn().mockResolvedValue('/finish-now');

    await runInterviewLoop(
      session,
      provider,
      'You are an interviewer.',
      onUserInput,
      async () => {},
      { '/finish-now': finishNowHandler },
    );

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith('I have enough info.');

    const saves = parseSaves();
    const completedSave = saves.find((s) => s.completed === true);
    expect(completedSave).toBeDefined();
    expect(completedSave?.finishedEarly).toBe(true);
    expect(completedSave?.stage).toBe('spec');
  });

  it('does not send /finish-now input as a user message to the model', async () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Done. ${COMPLETION_MARKER}`),
    };
    const sessionRef = { current: session };
    const finishNowHandler = createFinishNowHandler({
      getSession: () => sessionRef.current,
      onSessionUpdate: (s) => {
        sessionRef.current = s;
      },
      provider,
      systemPrompt: 'system',
      onResponse: vi.fn(async () => {}),
    });

    await runInterviewLoop(
      session,
      provider,
      'system',
      vi.fn().mockResolvedValue('/finish-now'),
      async () => {},
      { '/finish-now': finishNowHandler },
    );

    const saves = parseSaves();
    const allTranscripts = saves.flatMap((s) => s.transcript);
    expect(allTranscripts.every((m) => m.content !== '/finish-now')).toBe(true);
  });
});

describe('/model switching', () => {
  it('persists new model in session and continues interview after switch', async () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Thanks! ${COMPLETION_MARKER}`),
    };
    const sessionRef = { current: session };
    const lister = { listModels: vi.fn().mockResolvedValue(['llama3', 'mistral']) };
    const modelHandler = createModelHandler({
      getSession: () => sessionRef.current,
      onSessionUpdate: (s) => {
        sessionRef.current = s;
      },
      modelLister: lister,
      onSelectModel: vi.fn().mockResolvedValue('mistral'),
    });

    let callCount = 0;
    const onUserInput = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? '/model' : 'my real answer';
    });

    await runInterviewLoop(
      session,
      provider,
      'system',
      onUserInput,
      async () => {},
      { '/model': modelHandler },
    );

    const saves = parseSaves();
    const modelSave = saves.find((s) => s.model === 'mistral');
    expect(modelSave).toBeDefined();

    expect(provider.generate).toHaveBeenCalledTimes(1);

    const completedSave = saves.find((s) => s.completed === true);
    expect(completedSave).toBeDefined();
    expect(completedSave?.stage).toBe('spec');
  });

  it('does not modify transcript when switching models', async () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Done! ${COMPLETION_MARKER}`),
    };
    const sessionRef = { current: session };
    const modelHandler = createModelHandler({
      getSession: () => sessionRef.current,
      onSessionUpdate: (s) => {
        sessionRef.current = s;
      },
      modelLister: { listModels: vi.fn().mockResolvedValue(['llama3']) },
      onSelectModel: vi.fn().mockResolvedValue('llama3'),
    });

    let callCount = 0;
    const onUserInput = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? '/model' : 'my answer';
    });

    await runInterviewLoop(
      session,
      provider,
      'system',
      onUserInput,
      async () => {},
      { '/model': modelHandler },
    );

    const saves = parseSaves();
    const modelSave = saves.find((s) => s.model === 'llama3');
    expect(modelSave).toBeDefined();
    expect(modelSave?.transcript).toEqual(session.transcript);
  });
});

describe('/provider command', () => {
  it('returns Ollama info and continues interview without ending it', async () => {
    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Done! ${COMPLETION_MARKER}`),
    };
    const providerHandler = createProviderHandler();

    let callCount = 0;
    const onUserInput = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? '/provider' : 'my answer';
    });
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(
      session,
      provider,
      'system',
      onUserInput,
      onAssistantResponse,
      { '/provider': providerHandler },
    );

    expect(onUserInput).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(finalSession.completed).toBe(true);
  });

  it('handler returns PROVIDER_MESSAGE in result', async () => {
    const providerHandler = createProviderHandler();
    const result = await providerHandler([]);

    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
    expect(result.message).toBe(PROVIDER_MESSAGE);
  });
});

describe('retry behavior', () => {
  it('retries failed operations and returns on first success', async () => {
    let callCount = 0;
    const operation = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('network error');
      return 'success';
    });

    const result = await withRetry(operation, { maxAttempts: 5 });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws RetryExhaustedError after all attempts fail', async () => {
    const operation = vi.fn(async () => {
      throw new Error('always fails');
    });
    const onRetryExhausted = vi.fn();

    await expect(
      withRetry(operation, { maxAttempts: 3, onRetryExhausted }),
    ).rejects.toThrow(RetryExhaustedError);

    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetryExhausted).toHaveBeenCalledWith(expect.any(Error), 3);
  });

  it('wraps model provider for resilient interview turns', async () => {
    let callCount = 0;
    const unreliableProvider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        if (callCount === 1) throw new Error('connection refused');
        return `Response! ${COMPLETION_MARKER}`;
      }),
    };

    const resilientProvider: ModelProvider = {
      generate: (messages) => withRetry(() => unreliableProvider.generate(messages)),
    };

    const session = makeSession({
      transcript: [
        { role: 'assistant', content: 'Question?', timestamp: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const onUserInput = vi.fn().mockResolvedValue('my answer');
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(
      session,
      resilientProvider,
      'system',
      onUserInput,
      onAssistantResponse,
    );

    expect(unreliableProvider.generate).toHaveBeenCalledTimes(2);
    expect(finalSession.completed).toBe(true);
  });

  it('RetryExhaustedError includes attempt count and cause', async () => {
    const cause = new Error('root cause');
    const operation = vi.fn(async () => {
      throw cause;
    });

    let caughtError: RetryExhaustedError | undefined;
    try {
      await withRetry(operation, { maxAttempts: 2 });
    } catch (err) {
      caughtError = err as RetryExhaustedError;
    }

    expect(caughtError).toBeInstanceOf(RetryExhaustedError);
    expect(caughtError?.attempts).toBe(2);
    expect(caughtError?.cause).toBe(cause);
  });
});

describe('session persistence after each turn', () => {
  it('saves session after initial model turn, user turn, model turn, and completion', async () => {
    const session = makeSession();
    let providerCallCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        providerCallCount++;
        if (providerCallCount === 1) return 'Question?';
        return `Thanks! ${COMPLETION_MARKER}`;
      }),
    };

    await runInterviewLoop(
      session,
      provider,
      'system',
      vi.fn().mockResolvedValue('my answer'),
      async () => {},
    );

    // 4 saves: appendInterviewMessage x3 + completeInterview x1
    expect(fsMock.writeFileSync).toHaveBeenCalledTimes(4);
    expect(fsMock.renameSync).toHaveBeenCalledTimes(4);

    const saves = parseSaves();
    expect(saves[0].transcript).toHaveLength(1);
    expect(saves[0].transcript[0].role).toBe('assistant');
    expect(saves[1].transcript).toHaveLength(2);
    expect(saves[1].transcript[1].role).toBe('user');
    expect(saves[2].transcript).toHaveLength(3);
    expect(saves[2].transcript[2].role).toBe('assistant');
    expect(saves[3].completed).toBe(true);
    expect(saves[3].stage).toBe('spec');
    expect(saves[3].finishedEarly).toBe(false);
  });

  it('saves session with updated timestamp on each persist', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn().mockResolvedValue(`Done! ${COMPLETION_MARKER}`),
    };

    await runInterviewLoop(
      session,
      provider,
      'system',
      vi.fn().mockResolvedValue('answer'),
      async () => {},
    );

    const saves = parseSaves();
    saves.forEach((s) => {
      expect(s.updatedAt).toBeTruthy();
    });
  });

  it('accumulates transcript across multiple turns before completion', async () => {
    const session = makeSession();
    let providerCallCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        providerCallCount++;
        if (providerCallCount <= 2) return `Question ${providerCallCount}?`;
        return `All done! ${COMPLETION_MARKER}`;
      }),
    };
    let userCallCount = 0;
    const onUserInput = vi.fn(async () => {
      userCallCount++;
      return `Answer ${userCallCount}`;
    });

    await runInterviewLoop(session, provider, 'system', onUserInput, async () => {});

    const saves = parseSaves();
    const finalSave = saves[saves.length - 1];
    expect(finalSave.completed).toBe(true);
    // transcript: Q1, A1, Q2, A2, Q3(done) = 5 messages
    expect(finalSave.transcript).toHaveLength(5);
  });
});
