import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProviderName } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export const CURRENT_SETTINGS_VERSION = 1;

export interface GlobalSettings {
  schemaVersion: number;
  defaultProvider?: ProviderName;
  defaultOllamaModel?: string;
}

export function getSettingsFilePath(): string {
  return path.join(os.homedir(), '.cobuild', 'settings.json');
}

export function defaultSettings(): GlobalSettings {
  return { schemaVersion: CURRENT_SETTINGS_VERSION };
}

function migrateSettings(raw: unknown): GlobalSettings {
  const data = raw as Record<string, unknown>;
  const logger = getLogger();

  const fromVersion = typeof data['schemaVersion'] === 'number' ? data['schemaVersion'] : 0;
  if (fromVersion > CURRENT_SETTINGS_VERSION) {
    logger.warn(
      `settings migration: settings has schema version ${fromVersion} which is newer than supported version ${CURRENT_SETTINGS_VERSION}; loading with best-effort field mapping`,
    );
  } else if (fromVersion < CURRENT_SETTINGS_VERSION) {
    logger.info(
      `settings migration: upgrading schema from version ${fromVersion} to ${CURRENT_SETTINGS_VERSION}`,
    );
  }

  const migrated: GlobalSettings = {
    schemaVersion: fromVersion > CURRENT_SETTINGS_VERSION ? fromVersion : CURRENT_SETTINGS_VERSION,
  };

  const rawProvider = data['defaultProvider'];
  if (rawProvider === 'ollama' || rawProvider === 'codex-cli') {
    migrated.defaultProvider = rawProvider;
  }

  if (typeof data['defaultOllamaModel'] === 'string' && data['defaultOllamaModel'].length > 0) {
    migrated.defaultOllamaModel = data['defaultOllamaModel'];
  }

  return migrated;
}

/**
 * Load global settings from ~/.cobuild/settings.json.
 * Returns default settings if the file does not exist or is invalid.
 */
export function loadSettings(): GlobalSettings {
  const filePath = getSettingsFilePath();
  const logger = getLogger();

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, { encoding: 'utf8' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('settings: no settings file found, using defaults');
      return defaultSettings();
    }
    logger.error(`settings: failed to read settings file at ${filePath}: ${(err as Error).message}`);
    return defaultSettings();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error(`settings: corrupted JSON in settings file ${filePath}, using defaults`);
    return defaultSettings();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.error(`settings: unexpected data structure in settings file ${filePath}, using defaults`);
    return defaultSettings();
  }

  return migrateSettings(parsed);
}

/**
 * Save global settings to ~/.cobuild/settings.json atomically.
 * The ~/.cobuild/ directory must already exist (created by bootstrapDirectories).
 */
export function saveSettings(settings: GlobalSettings): void {
  const filePath = getSettingsFilePath();
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const json = JSON.stringify({ ...settings, schemaVersion: CURRENT_SETTINGS_VERSION }, null, 2);

  fs.writeFileSync(tmpPath, json, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    throw err;
  }

  getLogger().info('settings saved');
}
