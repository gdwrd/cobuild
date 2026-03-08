import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  appendInterviewMessage: vi.fn((session, role, content) => ({
    ...session,
    transcript: [...session.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
    updatedAt: '2026-01-01T00:00:01.000Z',
  })),
  getTranscript: vi.fn((session) => session.transcript),
  completeInterview: vi.fn((session, finishedEarly) => ({
    ...session,
    completed: true,
    stage: 'spec' as const,
    finishedEarly,
    updatedAt: '2026-01-01T00:00:02.000Z',
  })),
}));

import { appendInterviewMessage, getTranscript, completeInterview } from '../../session/session.js';
import {
  COMPLETION_MARKER,
  PROMPT_TOO_LARGE_MESSAGE,
  PromptTooLargeError,
  buildModelMessages,
  detectCompletion,
  stripCompletionMarker,
  runInterviewTurn,
  runInterviewLoop,
} from '../controller.js';
import { buildUnknownCommandMessage } from '../commands.js';
import type { ModelProvider } from '../controller.js';
import { MAX_PROMPT_TOKENS } from '../prompts.js';
import type { Session } from '../../session/session.js';

const makeSession = (transcript: Array<{ role: 'user' | 'assistant'; content: string }> = []): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: false,
  transcript: transcript.map((m) => ({ ...m, timestamp: '2026-01-01T00:00:00.000Z' })),
});

const makeProvider = (response: string): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(appendInterviewMessage).mockImplementation((session, role, content) => ({
    ...session,
    transcript: [...session.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
    updatedAt: '2026-01-01T00:00:01.000Z',
  }));
  vi.mocked(getTranscript).mockImplementation((session) => session.transcript);
  vi.mocked(completeInterview).mockImplementation((session, finishedEarly) => ({
    ...session,
    completed: true,
    stage: 'spec' as const,
    finishedEarly,
    updatedAt: '2026-01-01T00:00:02.000Z',
  }));
});

describe('buildModelMessages', () => {
  it('includes system prompt as first message', async () => {
    const session = makeSession();
    const messages = buildModelMessages('You are an interviewer.', session);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are an interviewer.' });
  });

  it('includes transcript messages after system prompt', async () => {
    const session = makeSession([
      { role: 'assistant', content: 'What is your project?' },
      { role: 'user', content: 'A todo app.' },
    ]);
    const messages = buildModelMessages('system', session);
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: 'assistant', content: 'What is your project?' });
    expect(messages[2]).toEqual({ role: 'user', content: 'A todo app.' });
  });

  it('returns only system message when transcript is empty', async () => {
    const session = makeSession();
    const messages = buildModelMessages('system', session);
    expect(messages).toHaveLength(1);
  });
});

describe('detectCompletion', () => {
  it('returns true when COMPLETION_MARKER is present', () => {
    expect(detectCompletion(`Great, I have enough info. ${COMPLETION_MARKER}`)).toBe(true);
  });

  it('returns false when COMPLETION_MARKER is absent', () => {
    expect(detectCompletion('What is your project idea?')).toBe(false);
  });

  it('returns true when response is only the marker', () => {
    expect(detectCompletion(COMPLETION_MARKER)).toBe(true);
  });
});

describe('stripCompletionMarker', () => {
  it('removes COMPLETION_MARKER from response', () => {
    const result = stripCompletionMarker(`Thank you! ${COMPLETION_MARKER}`);
    expect(result).toBe('Thank you!');
  });

  it('trims whitespace after stripping', () => {
    const result = stripCompletionMarker(`  Thanks!  ${COMPLETION_MARKER}  `);
    expect(result).toBe('Thanks!');
  });

  it('returns response unchanged when no marker present', () => {
    expect(stripCompletionMarker('What is your idea?')).toBe('What is your idea?');
  });
});

const makeLargeSession = (): Session => {
  // Build a session whose transcript content exceeds MAX_PROMPT_TOKENS * 4 chars
  const largeContent = 'a'.repeat(MAX_PROMPT_TOKENS * 4 + 1000);
  return makeSession([{ role: 'user', content: largeContent }]);
};

describe('PromptTooLargeError', () => {
  it('is an instance of Error', () => {
    const err = new PromptTooLargeError();
    expect(err).toBeInstanceOf(Error);
  });

  it('has name PromptTooLargeError', () => {
    const err = new PromptTooLargeError();
    expect(err.name).toBe('PromptTooLargeError');
  });
});

describe('runInterviewTurn', () => {
  it('calls provider with model messages and appends response to session', async () => {
    const session = makeSession();
    const provider = makeProvider('What is your project?');

    const result = await runInterviewTurn(session, provider, 'You are an interviewer.');

    expect(provider.generate).toHaveBeenCalledWith([
      { role: 'system', content: 'You are an interviewer.' },
    ]);
    expect(appendInterviewMessage).toHaveBeenCalledWith(session, 'assistant', 'What is your project?');
    expect(result.response).toBe('What is your project?');
    expect(result.complete).toBe(false);
  });

  it('detects completion marker and strips it from response', async () => {
    const session = makeSession([{ role: 'user', content: 'A todo app.' }]);
    const provider = makeProvider(`Great, that is enough! ${COMPLETION_MARKER}`);

    const result = await runInterviewTurn(session, provider, 'system');

    expect(result.complete).toBe(true);
    expect(result.response).toBe('Great, that is enough!');
    expect(appendInterviewMessage).toHaveBeenCalledWith(session, 'assistant', 'Great, that is enough!');
  });

  it('includes existing transcript in messages sent to provider', async () => {
    const session = makeSession([
      { role: 'assistant', content: 'Question 1?' },
      { role: 'user', content: 'Answer 1' },
    ]);
    const provider = makeProvider('Question 2?');

    await runInterviewTurn(session, provider, 'system');

    expect(provider.generate).toHaveBeenCalledWith([
      { role: 'system', content: 'system' },
      { role: 'assistant', content: 'Question 1?' },
      { role: 'user', content: 'Answer 1' },
    ]);
  });

  it('returns updated session with appended response', async () => {
    const session = makeSession();
    const provider = makeProvider('First question?');

    const result = await runInterviewTurn(session, provider, 'system');

    expect(result.session.transcript).toHaveLength(1);
    expect(result.session.transcript[0].role).toBe('assistant');
    expect(result.session.transcript[0].content).toBe('First question?');
  });

  it('throws PromptTooLargeError when prompt exceeds token limit', async () => {
    const session = makeLargeSession();
    const provider = makeProvider('Should not be called');

    await expect(runInterviewTurn(session, provider, 'system')).rejects.toThrow(PromptTooLargeError);
  });

  it('does not call provider when prompt is too large', async () => {
    const session = makeLargeSession();
    const provider = makeProvider('Should not be called');

    await expect(runInterviewTurn(session, provider, 'system')).rejects.toThrow();
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

describe('runInterviewLoop', () => {
  it('starts with model asking first question when transcript is empty', async () => {
    const session = makeSession();
    const provider = makeProvider('What is your project idea?');
    const onUserInput = vi.fn(async () => 'A todo app.');
    const onAssistantResponse = vi.fn(async () => {});

    // After first model turn, let the second model response complete the interview
    let callCount = 0;
    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => {
      const updated = {
        ...s,
        transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
        updatedAt: '2026-01-01T00:00:01.000Z',
      };
      return updated;
    });
    vi.mocked(provider.generate as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? 'What is your project?' : `Thanks! ${COMPLETION_MARKER}`;
    });

    const finalSession = await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(onUserInput).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledTimes(2);
    expect(onAssistantResponse).toHaveBeenLastCalledWith('Thanks!', true);
    expect(finalSession).toBeDefined();
  });

  it('skips initial model turn when transcript already has messages', async () => {
    // Transcript ends with assistant (normal resume: model asked, waiting for user answer)
    const session = makeSession([
      { role: 'assistant', content: 'Previous question?' },
    ]);
    const provider = makeProvider(`All done! ${COMPLETION_MARKER}`);
    const onUserInput = vi.fn(async () => 'My answer.');
    const onAssistantResponse = vi.fn(async () => {});

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(onUserInput).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledWith('All done!', true);
  });

  it('generates model response first when transcript ends with user message (crash recovery)', async () => {
    const session = makeSession([
      { role: 'assistant', content: 'What is your project?' },
      { role: 'user', content: 'A todo app.' },
      // session ends here — as if it crashed before the assistant responded
    ]);
    let callCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? 'Tell me more.' : `All done! ${COMPLETION_MARKER}`;
      }),
    };
    const onUserInput = vi.fn(async () => 'More details.');
    const onAssistantResponse = vi.fn(async () => {});

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    // First call resumes the incomplete turn; second call follows user input
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(onAssistantResponse).toHaveBeenCalledTimes(2);
    expect(onAssistantResponse).toHaveBeenNthCalledWith(1, 'Tell me more.', false);
    expect(onUserInput).toHaveBeenCalledTimes(1);
  });

  it('loops until model signals completion', async () => {
    const session = makeSession();
    let callCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        if (callCount >= 3) return `Done! ${COMPLETION_MARKER}`;
        return `Question ${callCount}?`;
      }),
    };
    const onUserInput = vi.fn(async () => 'My answer.');
    const onAssistantResponse = vi.fn(async () => {});

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    // 3 model calls: initial Q1, then Q2, then Done (complete)
    expect(provider.generate).toHaveBeenCalledTimes(3);
    expect(onUserInput).toHaveBeenCalledTimes(2);
  });

  it('stops immediately if first model response signals completion', async () => {
    const session = makeSession();
    const provider = makeProvider(`All done! ${COMPLETION_MARKER}`);
    const onUserInput = vi.fn(async () => 'answer');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(onUserInput).not.toHaveBeenCalled();
    expect(onAssistantResponse).toHaveBeenCalledWith('All done!', true);
  });

  it('intercepts slash commands and does not send them to the model', async () => {
    const session = makeSession([{ role: 'assistant', content: 'Question?' }]);
    const provider = makeProvider(`Done! ${COMPLETION_MARKER}`);
    const commandHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: true });
    let callCount = 0;
    const onUserInput = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? '/model' : 'regular answer';
    });
    const onAssistantResponse = vi.fn(async () => {});

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse, {
      '/model': commandHandler,
    });

    expect(commandHandler).toHaveBeenCalledWith([]);
    // slash command input is never appended to transcript
    expect(appendInterviewMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      'user',
      '/model',
    );
  });

  it('stops interview loop when command returns continueInterview=false', async () => {
    const session = makeSession([{ role: 'assistant', content: 'Question?' }]);
    const provider = makeProvider('Never called');
    const finishHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: false });
    const onUserInput = vi.fn(async () => '/finish-now');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse, {
      '/finish-now': finishHandler,
    });

    expect(finishHandler).toHaveBeenCalledTimes(1);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(onAssistantResponse).not.toHaveBeenCalled();
  });

  it('calls completeInterview with finishedEarly=false on natural completion', async () => {
    const session = makeSession();
    const provider = makeProvider(`All done! ${COMPLETION_MARKER}`);
    const onUserInput = vi.fn(async () => 'answer');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(completeInterview).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('returns session with stage=spec after natural completion', async () => {
    const session = makeSession();
    const provider = makeProvider(`All done! ${COMPLETION_MARKER}`);
    const onUserInput = vi.fn(async () => 'answer');
    const onAssistantResponse = vi.fn(async () => {});

    const finalSession = await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(finalSession.stage).toBe('spec');
    expect(finalSession.completed).toBe(true);
  });

  it('responds with help message for unrecognized slash commands and re-prompts', async () => {
    const session = makeSession([{ role: 'assistant', content: 'Question?' }]);
    const provider = makeProvider(`Done! ${COMPLETION_MARKER}`);
    let callCount = 0;
    const onUserInput = vi.fn(async () => {
      callCount++;
      return callCount === 1 ? '/unknown-cmd' : 'real answer';
    });
    const onAssistantResponse = vi.fn(async () => {});

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    // called twice: once for /unknown-cmd (sends help), once for real answer
    expect(onUserInput).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    // unknown command triggers a help response
    expect(onAssistantResponse).toHaveBeenCalledWith(buildUnknownCommandMessage('/unknown-cmd'), false);
  });

  it('sends PROMPT_TOO_LARGE_MESSAGE and continues loop when initial turn prompt is too large', async () => {
    // Empty transcript — initial turn path. Make the system prompt huge.
    // After showing the message the loop continues; user types /finish-now to exit.
    const session = makeSession();
    const largeSystemPrompt = 'a'.repeat(MAX_PROMPT_TOKENS * 4 + 1000);
    const provider = makeProvider('Should not be called');
    const finishHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: false });
    const onUserInput = vi.fn(async () => '/finish-now');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, largeSystemPrompt, onUserInput, onAssistantResponse, {
      '/finish-now': finishHandler,
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(onAssistantResponse).toHaveBeenCalledWith(PROMPT_TOO_LARGE_MESSAGE, false);
    expect(onUserInput).toHaveBeenCalledTimes(1);
  });

  it('sends PROMPT_TOO_LARGE_MESSAGE and continues loop when resume turn prompt is too large', async () => {
    // Transcript ends with user — resume path. Large content in transcript.
    // After showing the message the loop continues; user types /finish-now to exit.
    const session = makeLargeSession();
    const provider = makeProvider('Should not be called');
    const finishHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: false });
    const onUserInput = vi.fn(async () => '/finish-now');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse, {
      '/finish-now': finishHandler,
    });

    expect(provider.generate).not.toHaveBeenCalled();
    expect(onAssistantResponse).toHaveBeenCalledWith(PROMPT_TOO_LARGE_MESSAGE, false);
    expect(onUserInput).toHaveBeenCalledTimes(1);
  });

  it('sends PROMPT_TOO_LARGE_MESSAGE and continues loop when main-loop turn prompt is too large', async () => {
    // Transcript ends with assistant so interview waits for user input.
    // generate always throws PromptTooLargeError; user sends 'answer' (triggers error),
    // then '/finish-now' to terminate.
    const session = makeSession([{ role: 'assistant', content: 'Question?' }]);
    const provider = makeProvider('Answer');
    const finishHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: false });
    let inputCount = 0;
    const onUserInput = vi.fn(async () => {
      inputCount++;
      return inputCount === 1 ? 'answer' : '/finish-now';
    });
    const onAssistantResponse = vi.fn(async () => {});

    // Make generate throw PromptTooLargeError to simulate oversized prompt in main loop
    vi.mocked(provider.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new PromptTooLargeError());

    vi.mocked(appendInterviewMessage).mockImplementation((s, role, content) => ({
      ...s,
      transcript: [...s.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse, {
      '/finish-now': finishHandler,
    });

    expect(onAssistantResponse).toHaveBeenCalledWith(PROMPT_TOO_LARGE_MESSAGE, false);
    expect(onUserInput).toHaveBeenCalledTimes(2);
  });

  it('does not auto-call completeInterview when prompt is too large on resume', async () => {
    // After PromptTooLargeError the loop continues; user uses /finish-now (mocked without
    // calling completeInterview) to stop. No automatic completeInterview call should occur.
    const session = makeLargeSession();
    const provider = makeProvider('Should not be called');
    const finishHandler = vi.fn().mockResolvedValue({ handled: true, continueInterview: false });
    const onUserInput = vi.fn(async () => '/finish-now');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse, {
      '/finish-now': finishHandler,
    });

    expect(completeInterview).not.toHaveBeenCalled();
  });
});
