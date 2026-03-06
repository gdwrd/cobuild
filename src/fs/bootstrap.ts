import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface BootstrapResult {
  ok: boolean;
  cobuildDir: string;
  message: string;
}

export function getCobuildDir(): string {
  return path.join(os.homedir(), '.cobuild');
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function bootstrapDirectories(): BootstrapResult {
  const cobuildDir = getCobuildDir();
  const sessionsDir = path.join(cobuildDir, 'sessions');
  const logsDir = path.join(cobuildDir, 'logs');

  try {
    ensureDir(cobuildDir);
    ensureDir(sessionsDir);
    ensureDir(logsDir);

    return {
      ok: true,
      cobuildDir,
      message: `directories ready: ${cobuildDir}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      cobuildDir,
      message: `failed to create directories: ${message}`,
    };
  }
}
