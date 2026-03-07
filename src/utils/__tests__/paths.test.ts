import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  getHomeDir,
  resolveHomePath,
  normalizePath,
  safeFilename,
  joinPath,
  isAbsolutePath,
} from '../paths.js';

describe('getHomeDir', () => {
  it('returns the same value as os.homedir()', () => {
    expect(getHomeDir()).toBe(os.homedir());
  });

  it('returns a non-empty string', () => {
    expect(getHomeDir().length).toBeGreaterThan(0);
  });
});

describe('resolveHomePath', () => {
  it('joins segments under the home directory', () => {
    expect(resolveHomePath('.cobuild')).toBe(path.join(os.homedir(), '.cobuild'));
  });

  it('handles multiple segments', () => {
    expect(resolveHomePath('.cobuild', 'sessions')).toBe(
      path.join(os.homedir(), '.cobuild', 'sessions'),
    );
  });
});

describe('normalizePath', () => {
  it('collapses double separators', () => {
    const input = '/foo//bar';
    expect(normalizePath(input)).toBe(path.normalize(input));
  });

  it('resolves dot segments', () => {
    expect(normalizePath('/foo/./bar/../baz')).toBe(path.normalize('/foo/./bar/../baz'));
  });

  it('returns the path unchanged when already normalized', () => {
    expect(normalizePath('/foo/bar')).toBe('/foo/bar');
  });
});

describe('safeFilename', () => {
  it('removes characters unsafe on Windows/macOS/Linux', () => {
    expect(safeFilename('foo:bar')).toBe('foo_bar');
    expect(safeFilename('foo<bar>')).toBe('foo_bar_');
    expect(safeFilename('foo/bar')).toBe('foo_bar');
    expect(safeFilename('foo\\bar')).toBe('foo_bar');
    expect(safeFilename('foo|bar')).toBe('foo_bar');
    expect(safeFilename('foo?bar')).toBe('foo_bar');
    expect(safeFilename('foo*bar')).toBe('foo_bar');
  });

  it('trims leading and trailing dots', () => {
    expect(safeFilename('.hidden')).toBe('hidden');
    expect(safeFilename('file.')).toBe('file');
  });

  it('trims leading and trailing spaces', () => {
    expect(safeFilename('  name  ')).toBe('name');
  });

  it('passes through safe names unchanged', () => {
    expect(safeFilename('session-2026-01-01')).toBe('session-2026-01-01');
  });

  it('truncates names longer than 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(safeFilename(long).length).toBe(255);
  });

  it('sanitizes control characters (\\x00-\\x1f)', () => {
    const withControl = 'foo\x00bar\x1fbaz';
    const result = safeFilename(withControl);
    expect(result).toBe('foo_bar_baz');
  });

  it('sanitizes DEL character (\\x7f)', () => {
    const withDel = 'foo\x7fbar';
    const result = safeFilename(withDel);
    expect(result).toBe('foo_bar');
  });

  it('returns empty string for input that is all unsafe characters', () => {
    // All dots get stripped by the leading/trailing trim, but mid-string dots are kept.
    // A string of only unsafe special chars becomes all underscores, then trimmed of
    // leading/trailing spaces (no dots) → stays as underscores.
    expect(safeFilename(':::')).toBe('___');
  });

  it('returns empty string for input that is only dots', () => {
    expect(safeFilename('...')).toBe('');
  });

  it('preserves unicode letters', () => {
    expect(safeFilename('café')).toBe('café');
  });

  it('handles empty string input', () => {
    expect(safeFilename('')).toBe('');
  });
});

describe('joinPath', () => {
  it('joins path segments', () => {
    expect(joinPath('/foo', 'bar', 'baz')).toBe('/foo/bar/baz');
  });

  it('is equivalent to path.join', () => {
    expect(joinPath('a', 'b', 'c')).toBe(path.join('a', 'b', 'c'));
  });
});

describe('isAbsolutePath', () => {
  it('returns true for absolute paths', () => {
    expect(isAbsolutePath('/usr/local/bin')).toBe(true);
  });

  it('returns false for relative paths', () => {
    expect(isAbsolutePath('relative/path')).toBe(false);
    expect(isAbsolutePath('./foo')).toBe(false);
  });
});
