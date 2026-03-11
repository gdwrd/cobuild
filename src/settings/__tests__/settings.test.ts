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

describe('getSettingsFilePath', () => {
  it('returns path under home dir', async () => {
    const { getSettingsFilePath } = await import('../settings.js');
    expect(getSettingsFilePath()).toBe('/home/testuser/.cobuild/settings.json');
  });
});

describe('defaultSettings', () => {
  it('returns schema version and no provider/model fields', async () => {
    const { defaultSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = defaultSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(s.defaultProvider).toBeUndefined();
    expect(s.defaultOllamaModel).toBeUndefined();
  });
});

describe('loadSettings', () => {
  it('returns defaults when settings file does not exist', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    fsMock.readFileSync.mockImplementation(() => { throw enoent; });

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(s.defaultProvider).toBeUndefined();
    expect(s.defaultOllamaModel).toBeUndefined();
  });

  it('returns defaults when read fails with a non-ENOENT error', async () => {
    const readErr = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    fsMock.readFileSync.mockImplementation(() => { throw readErr; });

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('returns defaults when file contains corrupted JSON', async () => {
    fsMock.readFileSync.mockReturnValue('{ invalid json !!');

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('returns defaults when file contains non-object JSON', async () => {
    fsMock.readFileSync.mockReturnValue('"just a string"');

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('returns defaults when file contains a JSON array', async () => {
    fsMock.readFileSync.mockReturnValue('[1, 2, 3]');

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('loads valid settings with ollama provider', async () => {
    const stored = JSON.stringify({
      schemaVersion: 1,
      defaultProvider: 'ollama',
      defaultOllamaModel: 'llama3',
    });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings } = await import('../settings.js');
    const s = loadSettings();
    expect(s.defaultProvider).toBe('ollama');
    expect(s.defaultOllamaModel).toBe('llama3');
  });

  it('loads valid settings with codex-cli provider', async () => {
    const stored = JSON.stringify({
      schemaVersion: 1,
      defaultProvider: 'codex-cli',
    });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings } = await import('../settings.js');
    const s = loadSettings();
    expect(s.defaultProvider).toBe('codex-cli');
    expect(s.defaultOllamaModel).toBeUndefined();
  });

  it('strips invalid provider values and falls back to undefined', async () => {
    const stored = JSON.stringify({ schemaVersion: 1, defaultProvider: 'unknown-provider' });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings } = await import('../settings.js');
    const s = loadSettings();
    expect(s.defaultProvider).toBeUndefined();
  });

  it('strips empty string for defaultOllamaModel', async () => {
    const stored = JSON.stringify({ schemaVersion: 1, defaultOllamaModel: '' });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings } = await import('../settings.js');
    const s = loadSettings();
    expect(s.defaultOllamaModel).toBeUndefined();
  });

  it('migrates older schema version and logs upgrade', async () => {
    const stored = JSON.stringify({ schemaVersion: 0, defaultProvider: 'ollama' });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
    expect(s.defaultProvider).toBe('ollama');
  });

  it('preserves newer schema version and warns', async () => {
    const stored = JSON.stringify({ schemaVersion: 999 });
    fsMock.readFileSync.mockReturnValue(stored);

    const { loadSettings } = await import('../settings.js');
    const s = loadSettings();
    expect(s.schemaVersion).toBe(999);
  });
});

describe('saveSettings', () => {
  it('writes to a tmp file then renames atomically', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { saveSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    saveSettings({ schemaVersion: CURRENT_SETTINGS_VERSION, defaultProvider: 'ollama', defaultOllamaModel: 'llama3' });

    const expectedPath = path.join('/home/testuser', '.cobuild', 'settings.json');
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(expectedPath),
      expect.stringContaining('"defaultProvider": "ollama"'),
      expect.objectContaining({ encoding: 'utf8', mode: 0o600 }),
    );
    expect(fsMock.renameSync).toHaveBeenCalledWith(
      expect.stringContaining(expectedPath),
      expectedPath,
    );
  });

  it('always writes current schema version', async () => {
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => {});

    const { saveSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    saveSettings({ schemaVersion: 0 });

    const written = (fsMock.writeFileSync.mock.calls[0][1] as string);
    const parsed = JSON.parse(written) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('re-throws rename error and unlinks tmp file', async () => {
    const renameErr = new Error('EACCES: permission denied');
    fsMock.writeFileSync.mockImplementation(() => {});
    fsMock.renameSync.mockImplementation(() => { throw renameErr; });
    fsMock.unlinkSync.mockImplementation(() => {});

    const { saveSettings, CURRENT_SETTINGS_VERSION } = await import('../settings.js');
    expect(() => saveSettings({ schemaVersion: CURRENT_SETTINGS_VERSION })).toThrow(
      'EACCES: permission denied',
    );
    expect(fsMock.unlinkSync).toHaveBeenCalled();
  });
});
