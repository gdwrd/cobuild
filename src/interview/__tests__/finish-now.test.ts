import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  appendInterviewMessage: vi.fn((session, role, content) => ({
    ...session,
    transcript: [...session.transcript, { role, content, timestamp: '2026-01-01T00:00:01.000Z' }],
    updatedAt: '2026-01-01T00:00:01.000Z',
  })),
  saveSession: vi.fn(),
  getTranscript: vi.fn((session) => session.transcript),
}));

import { appendInterviewMessage, saveSession, getTranscript } from '../../session/session.js';
import {
  FINISH_NOW_PROMPT,
  buildFinishNowMessages,
  createFinishNowHandler,
} from '../finish-now.js';
import type { FinishNowHandlerOptions } from '../finish-now.js';
import { COMPLETION_MARKER } from '../controller.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../controller.js';

const makeSession = (
  transcript: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Session => ({
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
  vi.mocked(saveSession).mockImplementation(() => {});
  vi.mocked(getTranscript).mockImplementation((session) => session.transcript);
});

describe('buildFinishNowMessages', () => {
  it('includes system prompt and transcript messages', () => {
    const session = makeSession([
      { role: 'assistant', content: 'What is your project?' },
      { role: 'user', content: 'A todo app.' },
    ]);
    const messages = buildFinishNowMessages(session, 'You are an interviewer.');
    expect(messages[0]).toEqual({ role: 'system', content: 'You are an interviewer.' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'What is your project?' });
    expect(messages[2]).toEqual({ role: 'user', content: 'A todo app.' });
  });

  it('appends FINISH_NOW_PROMPT as final user message', () => {
    const session = makeSession();
    const messages = buildFinishNowMessages(session, 'system prompt');
    const last = messages[messages.length - 1];
    expect(last).toEqual({ role: 'user', content: FINISH_NOW_PROMPT });
  });

  it('appends finish-now user message even with empty transcript', () => {
    const session = makeSession();
    const messages = buildFinishNowMessages(session, 'system');
    // system + finish-now user message
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe(FINISH_NOW_PROMPT);
  });
});

describe('createFinishNowHandler', () => {
  const makeOptions = (
    session: Session,
    provider: ModelProvider,
    overrides: Partial<FinishNowHandlerOptions> = {},
  ): FinishNowHandlerOptions => {
    let currentSession = session;
    return {
      getSession: () => currentSession,
      onSessionUpdate: vi.fn((s) => { currentSession = s; }),
      provider,
      systemPrompt: 'You are an interviewer.',
      onResponse: vi.fn(async () => {}),
      ...overrides,
    };
  };

  it('calls provider with finish-now messages', async () => {
    const session = makeSession([{ role: 'assistant', content: 'Question?' }]);
    const provider = makeProvider(`Thanks! I have enough info. ${COMPLETION_MARKER}`);
    const options = makeOptions(session, provider);
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(provider.generate).toHaveBeenCalledOnce();
    const messages = vi.mocked(provider.generate).mock.calls[0][0];
    expect(messages[0]).toEqual({ role: 'system', content: 'You are an interviewer.' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: FINISH_NOW_PROMPT });
  });

  it('strips COMPLETION_MARKER from response before storing', async () => {
    const session = makeSession();
    const provider = makeProvider(`Great summary. ${COMPLETION_MARKER}`);
    const options = makeOptions(session, provider);
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(appendInterviewMessage).toHaveBeenCalledWith(
      expect.anything(),
      'assistant',
      'Great summary.',
    );
  });

  it('appends assistant response to session transcript', async () => {
    const session = makeSession();
    const provider = makeProvider(`All done. ${COMPLETION_MARKER}`);
    const options = makeOptions(session, provider);
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(appendInterviewMessage).toHaveBeenCalledWith(session, 'assistant', 'All done.');
  });

  it('marks session as completed and saves it', async () => {
    const session = makeSession();
    const provider = makeProvider(`Done. ${COMPLETION_MARKER}`);
    const onSessionUpdate = vi.fn();
    const options = makeOptions(session, provider, { onSessionUpdate });
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(saveSession).toHaveBeenCalledOnce();
    const savedSession = vi.mocked(saveSession).mock.calls[0][0];
    expect(savedSession.completed).toBe(true);
  });

  it('calls onSessionUpdate with completed session', async () => {
    const session = makeSession();
    const provider = makeProvider(`Done. ${COMPLETION_MARKER}`);
    const onSessionUpdate = vi.fn();
    const options = makeOptions(session, provider, { onSessionUpdate });
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(onSessionUpdate).toHaveBeenCalledOnce();
    const updatedSession = onSessionUpdate.mock.calls[0][0];
    expect(updatedSession.completed).toBe(true);
  });

  it('calls onResponse with the cleaned response text', async () => {
    const session = makeSession();
    const provider = makeProvider(`Interview complete. ${COMPLETION_MARKER}`);
    const onResponse = vi.fn(async () => {});
    const options = makeOptions(session, provider, { onResponse });
    const handler = createFinishNowHandler(options);

    await handler([]);

    expect(onResponse).toHaveBeenCalledWith('Interview complete.');
  });

  it('returns { handled: true, continueInterview: false }', async () => {
    const session = makeSession();
    const provider = makeProvider(`Done. ${COMPLETION_MARKER}`);
    const options = makeOptions(session, provider);
    const handler = createFinishNowHandler(options);

    const result = await handler([]);

    expect(result).toEqual({ handled: true, continueInterview: false });
  });

  it('uses current session from getSession at time of invocation', async () => {
    const initial = makeSession();
    const later = makeSession([{ role: 'assistant', content: 'Later question?' }]);
    let currentSession = initial;
    const provider = makeProvider(`Done. ${COMPLETION_MARKER}`);
    const options = makeOptions(initial, provider, {
      getSession: () => currentSession,
    });
    const handler = createFinishNowHandler(options);

    // Update session reference before calling handler
    currentSession = later;
    await handler([]);

    const messages = vi.mocked(provider.generate).mock.calls[0][0];
    // Should include the later question in transcript
    expect(messages.some((m) => m.content === 'Later question?')).toBe(true);
  });
});
