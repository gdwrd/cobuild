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
    };
    fsMock.readFileSync.mockReturnValue(JSON.stringify(mockSession));

    const { loadSession } = await import('../session.js');
    const result = loadSession('abc');

    expect(result).toEqual(mockSession);
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
});

describe('updateSession', () => {
  it('returns session with updated timestamp and saves it', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { updateSession } = await import('../session.js');
    const original = {
      id: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      workingDirectory: '/work',
      completed: false,
    };

    const updated = updateSession(original);

    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt).not.toBe(original.updatedAt);
    expect(fsMock.writeFileSync).toHaveBeenCalled();
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
    JSON.stringify({ id, createdAt, updatedAt: createdAt, workingDirectory, completed });

  it('returns null when sessions directory does not exist', async () => {
    fsMock.readdirSync.mockImplementation(() => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw err;
    });

    const { findLatestByWorkingDirectory } = await import('../session.js');
    expect(findLatestByWorkingDirectory('/work')).toBeNull();
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

  it('skips corrupted session files', async () => {
    fsMock.readdirSync.mockReturnValue(['bad.json', 'good.json'] as unknown as ReturnType<typeof fs.readdirSync>);
    fsMock.readFileSync
      .mockReturnValueOnce('not valid json{{{')
      .mockReturnValueOnce(makeSession('good', '/work', '2026-01-01T00:00:00.000Z'));

    const { findLatestByWorkingDirectory } = await import('../session.js');
    const result = findLatestByWorkingDirectory('/work');

    expect(result?.id).toBe('good');
  });
});
