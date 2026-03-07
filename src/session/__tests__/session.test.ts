import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs');
vi.mock('node:os');
vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const fsMock = vi.mocked(fs);
const osMock = vi.mocked(os);

beforeEach(() => {
  vi.resetAllMocks();
  osMock.homedir.mockReturnValue('/home/testuser');
});

describe('getSessionsDir', () => {
  it('returns correct path under home dir', async () => {
    const { getSessionsDir } = await import('../session.js');
    expect(getSessionsDir()).toBe('/home/testuser/.cobuild/sessions');
  });
});

describe('getSessionFilePath', () => {
  it('returns json file path for session id', async () => {
    const { getSessionFilePath } = await import('../session.js');
    expect(getSessionFilePath('abc-123')).toBe(
      '/home/testuser/.cobuild/sessions/abc-123.json',
    );
  });

  it('throws on path traversal in session id', async () => {
    const { getSessionFilePath } = await import('../session.js');
    expect(() => getSessionFilePath('../evil')).toThrow('Invalid session ID');
  });
});

describe('createSession', () => {
  it('generates a session with uuid, timestamps, and workingDirectory', async () => {
    const { createSession } = await import('../session.js');
    const before = Date.now();
    const session = createSession();
    const after = Date.now();

    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(session.createdAt).toBe(session.updatedAt);
    expect(new Date(session.createdAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(session.createdAt).getTime()).toBeLessThanOrEqual(after);
    expect(session.workingDirectory).toBe(process.cwd());
    expect(session.completed).toBe(false);
  });
});

describe('saveSession', () => {
  it('re-throws rename error and unlinks tmp file', async () => {
    const renameErr = new Error('EACCES: permission denied');
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => { throw renameErr; });
    fsMock.unlinkSync.mockImplementation(() => {});

    const { saveSession } = await import('../session.js');
    const session = {
      id: 'test-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };

    expect(() => saveSession(session)).toThrow('EACCES: permission denied');
    expect(fsMock.unlinkSync).toHaveBeenCalled();
  });

  it('writes to tmp file then renames atomically', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { saveSession } = await import('../session.js');
    const session = {
      id: 'test-id',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };

    saveSession(session);

    const expectedPath = path.join(
      '/home/testuser',
      '.cobuild',
      'sessions',
      'test-id.json',
    );
    const expectedTmpPath = `${expectedPath}.${process.pid}.tmp`;
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expectedTmpPath,
      JSON.stringify(session, null, 2),
      { encoding: 'utf8', mode: 0o600 },
    );
    expect(fsMock.renameSync).toHaveBeenCalledWith(
      expectedTmpPath,
      expectedPath,
    );
  });
});

describe('loadSession', () => {
  it('returns parsed session when file exists', async () => {
    const mockSession = {
      id: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };
    fsMock.readFileSync.mockReturnValue(JSON.stringify(mockSession));

    const { loadSession, CURRENT_SCHEMA_VERSION } = await import('../session.js');
    const result = loadSession('abc');

    expect(result?.id).toBe('abc');
    expect(result?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result?.completed).toBe(false);
    expect(result?.workingDirectory).toBe('/work');
  });

  it('returns null when file does not exist', async () => {
    fsMock.readFileSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      throw err;
    });

    const { loadSession } = await import('../session.js');
    const result = loadSession('missing');

    expect(result).toBeNull();
  });

  it('re-throws non-ENOENT errors', async () => {
    fsMock.readFileSync.mockImplementation(() => {
      const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      throw err;
    });

    const { loadSession } = await import('../session.js');
    expect(() => loadSession('abc')).toThrow('EACCES: permission denied');
  });

  it('returns null for corrupted JSON and logs the error', async () => {
    fsMock.readFileSync.mockReturnValue('not valid json{{{');
    const errorFn = vi.fn();
    vi.doMock('../../logging/logger.js', () => ({
      getLogger: () => ({ info: vi.fn(), error: errorFn, warn: vi.fn(), debug: vi.fn() }),
    }));

    const { loadSession } = await import('../session.js');
    const result = loadSession('bad-session');

    expect(result).toBeNull();
  });

  it('returns null when parsed JSON is an array', async () => {
    fsMock.readFileSync.mockReturnValue(JSON.stringify([{ id: 'x' }]));

    const { loadSession } = await import('../session.js');
    const result = loadSession('array-session');

    expect(result).toBeNull();
  });

  it('returns null when parsed JSON is a primitive', async () => {
    fsMock.readFileSync.mockReturnValue('"just a string"');

    const { loadSession } = await import('../session.js');
    const result = loadSession('primitive-session');

    expect(result).toBeNull();
  });

  it('returns null when parsed JSON is null', async () => {
    fsMock.readFileSync.mockReturnValue('null');

    const { loadSession } = await import('../session.js');
    const result = loadSession('null-session');

    expect(result).toBeNull();
  });
});


describe('createAndSaveSession', () => {
  it('creates and saves session, returning it', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { createAndSaveSession } = await import('../session.js');
    const session = createAndSaveSession();

    expect(session.id).toBeTruthy();
    expect(session.completed).toBe(false);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });
});

describe('findLatestByWorkingDirectory', () => {
  const makeSession = (id: string, workingDirectory: string, createdAt: string, completed = false) =>
    JSON.stringify({ id, createdAt, updatedAt: createdAt, workingDirectory, completed, transcript: [] });

  it('returns null when sessions directory does not exist', async () => {
    fsMock.readdirSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw err;
    });

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(findLatestByWorkingDirectory('/work')).toBeNull();
  });

  it('re-throws non-ENOENT errors from readdirSync', async () => {
    fsMock.readdirSync.mockImplementation(() => {
      const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      throw err;
    });

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(() => findLatestByWorkingDirectory('/work')).toThrow('EACCES: permission denied');
  });

  it('returns null when no sessions match working directory', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(makeSession('session-a', '/other', '2026-01-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(findLatestByWorkingDirectory('/work')).toBeNull();
  });

  it('returns the most recent session matching working directory', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json', 'session-b.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync
      .mockReturnValueOnce(makeSession('session-a', '/work', '2026-01-01T00:00:00.000Z'))
      .mockReturnValueOnce(makeSession('session-b', '/work', '2026-02-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('session-b');
  });

  it('skips non-json files', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json', 'README.txt'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(makeSession('session-a', '/work', '2026-01-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('session-a');
    expect(fsMock.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('skips completed sessions and returns the most recent incomplete one', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json', 'session-b.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync
      .mockReturnValueOnce(makeSession('session-a', '/work', '2026-01-01T00:00:00.000Z', false))
      .mockReturnValueOnce(makeSession('session-b', '/work', '2026-02-01T00:00:00.000Z', true));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('session-a');
  });

  it('returns null when all matching sessions are completed', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(makeSession('session-a', '/work', '2026-01-01T00:00:00.000Z', true));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(findLatestByWorkingDirectory('/work')).toBeNull();
  });

  it('skips corrupted session files', async () => {
    fsMock.readdirSync.mockReturnValue(['bad.json', 'good.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync
      .mockReturnValueOnce('not valid json{{{')
      .mockReturnValueOnce(makeSession('good', '/work', '2026-01-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('good');
  });

  it('re-throws permission errors from individual session load', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockImplementation(() => {
      const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      throw err;
    });

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(() => findLatestByWorkingDirectory('/work')).toThrow('EACCES: permission denied');
  });
});

describe('appendInterviewMessage', () => {
  const baseSession = {
    id: 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: false,
    transcript: [],
  };

  it('appends a user message and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { appendInterviewMessage } = await import('../session.js');
    const updated = appendInterviewMessage(baseSession, 'user', 'Hello!');

    expect(updated.transcript).toHaveLength(1);
    expect(updated.transcript[0].role).toBe('user');
    expect(updated.transcript[0].content).toBe('Hello!');
    expect(updated.transcript[0].timestamp).toBeTruthy();
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('appends an assistant message and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { appendInterviewMessage } = await import('../session.js');
    const updated = appendInterviewMessage(baseSession, 'assistant', 'What is your project idea?');

    expect(updated.transcript[0].role).toBe('assistant');
    expect(updated.transcript[0].content).toBe('What is your project idea?');
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { appendInterviewMessage } = await import('../session.js');
    appendInterviewMessage(baseSession, 'user', 'Hi');

    expect(baseSession.transcript).toHaveLength(0);
  });

  it('accumulates messages across calls', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { appendInterviewMessage } = await import('../session.js');
    const after1 = appendInterviewMessage(baseSession, 'assistant', 'Question 1?');
    const after2 = appendInterviewMessage(after1, 'user', 'Answer 1');

    expect(after2.transcript).toHaveLength(2);
    expect(after2.transcript[0].role).toBe('assistant');
    expect(after2.transcript[1].role).toBe('user');
  });

  it('updates updatedAt on append', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { appendInterviewMessage } = await import('../session.js');
    const updated = appendInterviewMessage(baseSession, 'user', 'Hi');

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });
});

describe('persistErrorState', () => {
  it('saves session with lastError field set', async () => {
    const { persistErrorState } = await import('../session.js');
    fsMock.writeFileSync.mockReturnValue(undefined);
    fsMock.renameSync.mockReturnValue(undefined);

    const session = {
      id: 'sess-err',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };

    const updated = persistErrorState(session, 'something went wrong');
    expect(updated.lastError).toBe('something went wrong');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('returns updated session object with lastError', async () => {
    const { persistErrorState } = await import('../session.js');
    fsMock.writeFileSync.mockReturnValue(undefined);
    fsMock.renameSync.mockReturnValue(undefined);

    const session = {
      id: 'sess-err2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };

    const updated = persistErrorState(session, 'model timeout');
    expect(updated.id).toBe('sess-err2');
    expect(updated.lastError).toBe('model timeout');
    expect(updated.transcript).toEqual([]);
  });
});

describe('completeInterview', () => {
  const baseSession = {
    id: 'sess-c',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: false,
    stage: 'interview' as const,
    transcript: [],
  };

  it('sets completed=true, stage=spec, and finishedEarly=false for natural completion', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeInterview } = await import('../session.js');
    const updated = completeInterview(baseSession, false);

    expect(updated.completed).toBe(true);
    expect(updated.stage).toBe('spec');
    expect(updated.finishedEarly).toBe(false);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('sets finishedEarly=true when ended via /finish-now', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeInterview } = await import('../session.js');
    const updated = completeInterview(baseSession, true);

    expect(updated.finishedEarly).toBe(true);
    expect(updated.stage).toBe('spec');
    expect(updated.completed).toBe(true);
  });

  it('updates updatedAt on completion', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeInterview } = await import('../session.js');
    const updated = completeInterview(baseSession, false);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeInterview } = await import('../session.js');
    completeInterview(baseSession, false);

    expect(baseSession.completed).toBe(false);
    expect(baseSession.stage).toBe('interview');
  });
});

describe('persistSpecArtifact', () => {
  const baseSession = {
    id: 'sess-spec',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'spec' as const,
    transcript: [],
  };

  it('stores content, filePath, and generated=true on session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistSpecArtifact } = await import('../session.js');
    const updated = persistSpecArtifact(baseSession, '# Spec\n## Overview\nFoo', '/work/docs/my-spec.md');

    expect(updated.specArtifact).toEqual({
      content: '# Spec\n## Overview\nFoo',
      filePath: '/work/docs/my-spec.md',
      generated: true,
    });
  });

  it('saves session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistSpecArtifact } = await import('../session.js');
    persistSpecArtifact(baseSession, '# Spec', '/work/docs/my-spec.md');

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistSpecArtifact } = await import('../session.js');
    const updated = persistSpecArtifact(baseSession, '# Spec', '/work/docs/my-spec.md');

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistSpecArtifact } = await import('../session.js');
    persistSpecArtifact(baseSession, '# Spec', '/work/docs/my-spec.md');

    expect((baseSession as Record<string, unknown>)['specArtifact']).toBeUndefined();
  });

  it('preserves other session fields', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistSpecArtifact } = await import('../session.js');
    const updated = persistSpecArtifact(baseSession, '# Spec', '/work/docs/my-spec.md');

    expect(updated.id).toBe(baseSession.id);
    expect(updated.workingDirectory).toBe(baseSession.workingDirectory);
    expect(updated.completed).toBe(baseSession.completed);
    expect(updated.stage).toBe(baseSession.stage);
    expect(updated.transcript).toEqual(baseSession.transcript);
  });
});

describe('completeSpecStage', () => {
  const baseSession = {
    id: 'sess-spec-complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'spec' as const,
    transcript: [],
    specArtifact: { content: '# Spec', filePath: '/work/docs/spec.md', generated: true },
  };

  it('sets stage to architecture', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeSpecStage } = await import('../session.js');
    const updated = completeSpecStage(baseSession);

    expect(updated.stage).toBe('architecture');
  });

  it('persists session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeSpecStage } = await import('../session.js');
    completeSpecStage(baseSession);

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeSpecStage } = await import('../session.js');
    const updated = completeSpecStage(baseSession);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeSpecStage } = await import('../session.js');
    completeSpecStage(baseSession);

    expect(baseSession.stage).toBe('spec');
  });

  it('preserves other session fields', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeSpecStage } = await import('../session.js');
    const updated = completeSpecStage(baseSession);

    expect(updated.id).toBe(baseSession.id);
    expect(updated.workingDirectory).toBe(baseSession.workingDirectory);
    expect(updated.completed).toBe(baseSession.completed);
    expect(updated.specArtifact).toEqual(baseSession.specArtifact);
    expect(updated.transcript).toEqual(baseSession.transcript);
  });
});

describe('persistWorkflowDecision', () => {
  const baseSession = {
    id: 'sess-wd',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'spec' as const,
    transcript: [],
  };

  it('sets architectureDecision=true on session and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistWorkflowDecision } = await import('../session.js');
    const updated = persistWorkflowDecision(baseSession, 'architecture', true);

    expect(updated.architectureDecision).toBe(true);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('sets planDecision=false on session and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistWorkflowDecision } = await import('../session.js');
    const updated = persistWorkflowDecision(baseSession, 'plan', false);

    expect(updated.planDecision).toBe(false);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistWorkflowDecision } = await import('../session.js');
    persistWorkflowDecision(baseSession, 'architecture', true);

    expect((baseSession as Record<string, unknown>)['architectureDecision']).toBeUndefined();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistWorkflowDecision } = await import('../session.js');
    const updated = persistWorkflowDecision(baseSession, 'plan', true);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });
});

describe('persistArchitectureArtifact', () => {
  const baseSession = {
    id: 'sess-arch',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'architecture' as const,
    transcript: [],
  };

  it('stores content, filePath, and generated=true', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistArchitectureArtifact } = await import('../session.js');
    const updated = persistArchitectureArtifact(baseSession, '# Architecture', '/work/docs/arch.md');

    expect(updated.architectureArtifact).toEqual({
      content: '# Architecture',
      filePath: '/work/docs/arch.md',
      generated: true,
    });
  });

  it('saves session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistArchitectureArtifact } = await import('../session.js');
    persistArchitectureArtifact(baseSession, '# Architecture', '/work/docs/arch.md');

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistArchitectureArtifact } = await import('../session.js');
    persistArchitectureArtifact(baseSession, '# Architecture', '/work/docs/arch.md');

    expect((baseSession as Record<string, unknown>)['architectureArtifact']).toBeUndefined();
  });
});

describe('completeArchitectureStage', () => {
  const baseSession = {
    id: 'sess-arch-complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'architecture' as const,
    transcript: [],
  };

  it('sets stage to plan', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeArchitectureStage } = await import('../session.js');
    const updated = completeArchitectureStage(baseSession);

    expect(updated.stage).toBe('plan');
  });

  it('persists session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeArchitectureStage } = await import('../session.js');
    completeArchitectureStage(baseSession);

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeArchitectureStage } = await import('../session.js');
    completeArchitectureStage(baseSession);

    expect(baseSession.stage).toBe('architecture');
  });
});

describe('persistPlanArtifact', () => {
  const baseSession = {
    id: 'sess-plan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'plan' as const,
    transcript: [],
  };

  it('stores content, filePath, and generated=true', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistPlanArtifact } = await import('../session.js');
    const updated = persistPlanArtifact(baseSession, '# Plan', '/work/docs/plan.md');

    expect(updated.planArtifact).toEqual({
      content: '# Plan',
      filePath: '/work/docs/plan.md',
      generated: true,
    });
  });

  it('saves session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistPlanArtifact } = await import('../session.js');
    persistPlanArtifact(baseSession, '# Plan', '/work/docs/plan.md');

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistPlanArtifact } = await import('../session.js');
    persistPlanArtifact(baseSession, '# Plan', '/work/docs/plan.md');

    expect((baseSession as Record<string, unknown>)['planArtifact']).toBeUndefined();
  });
});

describe('completePlanStage', () => {
  const baseSession = {
    id: 'sess-plan-complete',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'architecture' as const,
    transcript: [],
  };

  it('persists session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completePlanStage } = await import('../session.js');
    completePlanStage(baseSession);

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completePlanStage } = await import('../session.js');
    const updated = completePlanStage(baseSession);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('sets stage to plan on the returned session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completePlanStage } = await import('../session.js');
    const updated = completePlanStage(baseSession);

    expect(updated.stage).toBe('plan');
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completePlanStage } = await import('../session.js');
    completePlanStage(baseSession);

    expect(baseSession.stage).toBe('architecture');
  });
});

describe('persistExtractedPhases', () => {
  const baseSession = {
    id: 'sess-phases',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'plan' as const,
    transcript: [],
  };

  const phases = [
    {
      number: 1,
      title: 'Phase One',
      goal: 'goal text',
      scope: 'scope text',
      deliverables: 'deliverables text',
      dependencies: 'none',
      acceptanceCriteria: 'criteria',
    },
  ];

  it('stores extracted phases in the returned session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistExtractedPhases } = await import('../session.js');
    const updated = persistExtractedPhases(baseSession, phases);

    expect(updated.extractedPhases).toEqual(phases);
  });

  it('persists session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistExtractedPhases } = await import('../session.js');
    persistExtractedPhases(baseSession, phases);

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistExtractedPhases } = await import('../session.js');
    const updated = persistExtractedPhases(baseSession, phases);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistExtractedPhases } = await import('../session.js');
    persistExtractedPhases(baseSession, phases);

    expect((baseSession as { extractedPhases?: unknown }).extractedPhases).toBeUndefined();
  });
});

describe('persistDevPlanPhaseCompletion', () => {
  const baseSession = {
    id: 'sess-devplan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'dev-plans' as const,
    transcript: [],
  };

  it('appends dev plan artifact to devPlanArtifacts and sets completedPhaseCount=1', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    const updated = persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/phase-1.md');

    expect(updated.devPlanArtifacts).toHaveLength(1);
    expect(updated.devPlanArtifacts![0]).toEqual({
      phaseNumber: 1,
      content: '# Plan: Phase 1',
      filePath: '/work/docs/plans/phase-1.md',
      generated: true,
    });
    expect(updated.completedPhaseCount).toBe(1);
  });

  it('accumulates artifacts across multiple calls', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    const after1 = persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/p1.md');
    const after2 = persistDevPlanPhaseCompletion(after1, 2, '# Plan: Phase 2', '/work/docs/plans/p2.md');

    expect(after2.devPlanArtifacts).toHaveLength(2);
    expect(after2.completedPhaseCount).toBe(2);
    expect(after2.devPlanArtifacts![1].phaseNumber).toBe(2);
  });

  it('increments completedPhaseCount from existing value', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    const sessionWithCount = { ...baseSession, completedPhaseCount: 3 };
    const updated = persistDevPlanPhaseCompletion(sessionWithCount, 4, '# Plan: Phase 4', '/work/docs/plans/p4.md');

    expect(updated.completedPhaseCount).toBe(4);
  });

  it('saves session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/p1.md');

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    const updated = persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/p1.md');

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/p1.md');

    expect((baseSession as Record<string, unknown>)['devPlanArtifacts']).toBeUndefined();
    expect((baseSession as Record<string, unknown>)['completedPhaseCount']).toBeUndefined();
  });

  it('preserves other session fields', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanPhaseCompletion } = await import('../session.js');
    const updated = persistDevPlanPhaseCompletion(baseSession, 1, '# Plan: Phase 1', '/work/docs/plans/p1.md');

    expect(updated.id).toBe(baseSession.id);
    expect(updated.workingDirectory).toBe(baseSession.workingDirectory);
    expect(updated.completed).toBe(baseSession.completed);
    expect(updated.stage).toBe(baseSession.stage);
    expect(updated.transcript).toEqual(baseSession.transcript);
  });
});

describe('getTranscript', () => {
  it('returns empty array for session with no messages', async () => {
    const { getTranscript } = await import('../session.js');
    const session = {
      id: 'sess-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    };
    expect(getTranscript(session)).toEqual([]);
  });

  it('returns transcript messages', async () => {
    const { getTranscript } = await import('../session.js');
    const msg = { role: 'user' as const, content: 'Hello', timestamp: '2026-01-01T00:00:00.000Z' };
    const session = {
      id: 'sess-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [msg],
    };
    expect(getTranscript(session)).toEqual([msg]);
  });
});

describe('persistDevPlansDecision', () => {
  const baseSession = {
    id: 'sess-dpd',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'plan' as const,
    transcript: [],
  };

  it('sets devPlansDecision=true on session and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlansDecision } = await import('../session.js');
    const updated = persistDevPlansDecision(baseSession, true);

    expect(updated.devPlansDecision).toBe(true);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('sets devPlansDecision=false on session and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlansDecision } = await import('../session.js');
    const updated = persistDevPlansDecision(baseSession, false);

    expect(updated.devPlansDecision).toBe(false);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlansDecision } = await import('../session.js');
    persistDevPlansDecision(baseSession, true);

    expect((baseSession as Record<string, unknown>)['devPlansDecision']).toBeUndefined();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlansDecision } = await import('../session.js');
    const updated = persistDevPlansDecision(baseSession, true);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });
});

describe('persistDevPlanStage', () => {
  const baseSession = {
    id: 'sess-dps',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'plan' as const,
    transcript: [],
  };

  it('sets stage to dev-plans and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanStage } = await import('../session.js');
    const updated = persistDevPlanStage(baseSession);

    expect(updated.stage).toBe('dev-plans');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanStage } = await import('../session.js');
    persistDevPlanStage(baseSession);

    expect(baseSession.stage).toBe('plan');
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanStage } = await import('../session.js');
    const updated = persistDevPlanStage(baseSession);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('clears devPlanHalted so a halted session can resume cleanly', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistDevPlanStage } = await import('../session.js');
    const haltedSession = { ...baseSession, devPlanHalted: true };
    const updated = persistDevPlanStage(haltedSession);

    expect(updated.devPlanHalted).toBeUndefined();
  });
});

describe('completeDevPlanStage', () => {
  const baseSession = {
    id: 'sess-cdps',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'dev-plans' as const,
    transcript: [],
  };

  it('sets devPlansComplete to true and saves', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeDevPlanStage } = await import('../session.js');
    const updated = completeDevPlanStage(baseSession);

    expect(updated.devPlansComplete).toBe(true);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeDevPlanStage } = await import('../session.js');
    completeDevPlanStage(baseSession);

    expect((baseSession as Record<string, unknown>)['devPlansComplete']).toBeUndefined();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { completeDevPlanStage } = await import('../session.js');
    const updated = completeDevPlanStage(baseSession);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });
});

describe('persistCurrentDevPlanPhase', () => {
  const baseSession = {
    id: 'sess-cdpp',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    workingDirectory: '/work',
    completed: true,
    stage: 'dev-plans' as const,
    transcript: [],
  };

  it('sets currentDevPlanPhase to the given number', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistCurrentDevPlanPhase } = await import('../session.js');
    const updated = persistCurrentDevPlanPhase(baseSession, 3);

    expect(updated.currentDevPlanPhase).toBe(3);
  });

  it('persists session to disk', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistCurrentDevPlanPhase } = await import('../session.js');
    persistCurrentDevPlanPhase(baseSession, 1);

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });

  it('updates updatedAt', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistCurrentDevPlanPhase } = await import('../session.js');
    const updated = persistCurrentDevPlanPhase(baseSession, 1);

    expect(updated.updatedAt).not.toBe(baseSession.updatedAt);
  });

  it('does not mutate the original session', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { persistCurrentDevPlanPhase } = await import('../session.js');
    persistCurrentDevPlanPhase(baseSession, 2);

    expect((baseSession as Record<string, unknown>)['currentDevPlanPhase']).toBeUndefined();
  });
});

describe('findLatestByWorkingDirectory (dev-plans resume)', () => {
  const makeDevPlanSession = (
    id: string,
    workingDirectory: string,
    createdAt: string,
    devPlansComplete?: boolean,
    devPlanHalted?: boolean,
  ) =>
    JSON.stringify({
      id,
      createdAt,
      updatedAt: createdAt,
      workingDirectory,
      completed: true,
      stage: 'dev-plans',
      transcript: [],
      devPlansComplete,
      devPlanHalted,
    });

  it('returns dev-plans session when incomplete', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(makeDevPlanSession('session-a', '/work', '2026-01-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('session-a');
  });

  it('skips dev-plans session when devPlansComplete is true', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(
      makeDevPlanSession('session-a', '/work', '2026-01-01T00:00:00.000Z', true),
    );

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result).toBeNull();
  });

  it('returns halted dev-plans session so it can be resumed', async () => {
    fsMock.readdirSync.mockReturnValue(['session-a.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync.mockReturnValue(
      makeDevPlanSession('session-a', '/work', '2026-01-01T00:00:00.000Z', undefined, true),
    );

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('session-a');
  });
});

describe('migrateSession', () => {
  it('returns session with current schemaVersion when already up to date', async () => {
    const { migrateSession, CURRENT_SCHEMA_VERSION } = await import('../session.js');
    const raw = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      stage: 'interview',
      transcript: [],
    };
    const result = migrateSession(raw);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.id).toBe('abc');
  });

  it('upgrades legacy session without schemaVersion', async () => {
    const { migrateSession, CURRENT_SCHEMA_VERSION } = await import('../session.js');
    const legacy = {
      id: 'legacy-1',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      workingDirectory: '/old-work',
      completed: true,
      stage: 'spec',
      transcript: [],
    };
    const result = migrateSession(legacy);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.id).toBe('legacy-1');
    expect(result.workingDirectory).toBe('/old-work');
    expect(result.completed).toBe(true);
    expect(result.stage).toBe('spec');
  });

  it('applies default values for required missing fields', async () => {
    const { migrateSession } = await import('../session.js');
    const sparse = {
      id: 'sparse-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
    };
    const result = migrateSession(sparse);
    expect(result.completed).toBe(false);
    expect(result.stage).toBe('interview');
    expect(result.transcript).toEqual([]);
  });

  it('preserves optional artifact fields from raw data', async () => {
    const { migrateSession } = await import('../session.js');
    const raw = {
      id: 'art-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: true,
      stage: 'architecture',
      transcript: [],
      specArtifact: { content: 'spec content', filePath: '/docs/spec.md', generated: true },
      architectureDecision: true,
    };
    const result = migrateSession(raw);
    expect(result.specArtifact?.content).toBe('spec content');
    expect(result.architectureDecision).toBe(true);
  });
});

describe('createSession schemaVersion', () => {
  it('includes current schemaVersion on new sessions', async () => {
    const { createSession, CURRENT_SCHEMA_VERSION } = await import('../session.js');
    const session = createSession();
    expect(session.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('loadSession migration', () => {
  it('returns migrated session with schemaVersion when file exists without it', async () => {
    const legacy = JSON.stringify({
      id: 'legacy-load',
      createdAt: '2025-06-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
      transcript: [],
    });
    fsMock.readFileSync.mockReturnValue(legacy);

    const { loadSession, CURRENT_SCHEMA_VERSION } = await import('../session.js');
    const session = loadSession('legacy-load');

    expect(session?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(session?.id).toBe('legacy-load');
  });
});
