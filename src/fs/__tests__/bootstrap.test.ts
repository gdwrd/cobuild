import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs');
vi.mock('node:os');

describe('bootstrap', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  describe('getCobuildDir', () => {
    it('returns path under home directory', async () => {
      const { getCobuildDir } = await import('../bootstrap.js');
      expect(getCobuildDir()).toBe('/home/testuser/.cobuild');
    });
  });

  describe('ensureDir', () => {
    it('calls mkdirSync with recursive option', async () => {
      const { ensureDir } = await import('../bootstrap.js');
      ensureDir('/some/path');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/some/path', { recursive: true });
    });
  });

  describe('bootstrapDirectories', () => {
    it('creates cobuild, sessions, and logs directories', async () => {
      const { bootstrapDirectories } = await import('../bootstrap.js');
      const result = bootstrapDirectories();

      expect(result.ok).toBe(true);
      expect(result.cobuildDir).toBe('/home/testuser/.cobuild');
      expect(result.message).toContain('/home/testuser/.cobuild');

      const calls = vi.mocked(fs.mkdirSync).mock.calls.map((c) => c[0]);
      expect(calls).toContain('/home/testuser/.cobuild');
      expect(calls).toContain(path.join('/home/testuser/.cobuild', 'sessions'));
      expect(calls).toContain(path.join('/home/testuser/.cobuild', 'logs'));
    });

    it('returns failure result when mkdirSync throws', async () => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('permission denied');
      });

      const { bootstrapDirectories } = await import('../bootstrap.js');
      const result = bootstrapDirectories();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('permission denied');
    });
  });
});
