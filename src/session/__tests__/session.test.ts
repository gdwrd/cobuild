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
  vi.clearAllMocks();
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
    };

    saveSession(session);

    const expectedPath = path.join(
      '/home/testuser',
      '.cobuild',
      'sessions',
      'test-id.json',
    );
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      `${expectedPath}.tmp`,
      JSON.stringify(session, null, 2),
      { encoding: 'utf8' },
    );
    expect(fsMock.renameSync).toHaveBeenCalledWith(
      `${expectedPath}.tmp`,
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
    };
    fsMock.readFileSync.mockReturnValue(JSON.stringify(mockSession));

    const { loadSession } = await import('../session.js');
    const result = loadSession('abc');

    expect(result).toEqual(mockSession);
  });

  it('returns null when file does not exist', async () => {
    fsMock.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
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
    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(fsMock.renameSync).toHaveBeenCalled();
  });
});
