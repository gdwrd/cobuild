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
  buildModelMessages,
  detectCompletion,
  stripCompletionMarker,
  runInterviewTurn,
  runInterviewLoop,
} from '../controller.js';
import type { ModelProvider } from '../controller.js';
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
    const session = makeSession([
      { role: 'assistant', content: 'Previous question?' },
      { role: 'user', content: 'Previous answer.' },
    ]);
    const provider = makeProvider(`All done! ${COMPLETION_MARKER}`);
    const onUserInput = vi.fn(async () => 'My answer.');
    const onAssistantResponse = vi.fn(async () => {});

    await runInterviewLoop(session, provider, 'system', onUserInput, onAssistantResponse);

    expect(onUserInput).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledTimes(1);
    expect(onAssistantResponse).toHaveBeenCalledWith('All done!', true);
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

  it('ignores unrecognized slash commands and re-prompts', async () => {
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

    // called twice: once for /unknown-cmd (ignored), once for real answer
    expect(onUserInput).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
