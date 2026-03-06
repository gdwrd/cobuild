import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Returns the user's home directory, cross-platform.
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Resolves a path relative to the user's home directory.
 */
export function resolveHomePath(...segments: string[]): string {
  return path.join(getHomeDir(), ...segments);
}

/**
 * Normalizes a filesystem path, resolving . and .. segments and
 * standardizing separators for the current platform.
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Strips characters from a string that are unsafe in filenames across
 * Windows, macOS, and Linux. Replaces unsafe characters with underscores
 * and trims leading/trailing dots and spaces.
 */
export function safeFilename(name: string): string {
  // Characters that are unsafe in filenames on Windows, macOS, or Linux
  // eslint-disable-next-line no-control-regex
  const unsafe = /[<>:"/\\|?*\x00-\x1f]/g;
  return name
    .replace(unsafe, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 255);
}

/**
 * Joins path segments and normalizes the result.
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Returns true if the given path is absolute.
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}
