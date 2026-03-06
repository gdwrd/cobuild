import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

describe('CLI entrypoint', () => {
  it('should have a valid package name', async () => {
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name: string; bin: Record<string, string> };
    expect(pkg.name).toBe('cobuild');
    expect(pkg.bin['cobuild']).toBeDefined();
  });
});

describe('CLI argument parsing', () => {
  function makeProgram() {
    const p = new Command();
    p.exitOverride();
    p
      .name('cobuild')
      .description('Interactive AI-powered CLI build assistant')
      .option('--new-session', 'Start a new session, discarding any existing session')
      .option('--verbose', 'Enable verbose logging');
    return p;
  }

  it('parses no arguments with all defaults false', () => {
    const p = makeProgram();
    p.parse(['node', 'cobuild']);
    const opts = p.opts<{ newSession?: boolean; verbose?: boolean }>();
    expect(opts.newSession).toBeUndefined();
    expect(opts.verbose).toBeUndefined();
  });

  it('parses --new-session flag', () => {
    const p = makeProgram();
    p.parse(['node', 'cobuild', '--new-session']);
    const opts = p.opts<{ newSession?: boolean; verbose?: boolean }>();
    expect(opts.newSession).toBe(true);
  });

  it('parses --verbose flag', () => {
    const p = makeProgram();
    p.parse(['node', 'cobuild', '--verbose']);
    const opts = p.opts<{ newSession?: boolean; verbose?: boolean }>();
    expect(opts.verbose).toBe(true);
  });

  it('parses --new-session and --verbose together', () => {
    const p = makeProgram();
    p.parse(['node', 'cobuild', '--new-session', '--verbose']);
    const opts = p.opts<{ newSession?: boolean; verbose?: boolean }>();
    expect(opts.newSession).toBe(true);
    expect(opts.verbose).toBe(true);
  });

  it('throws on unrecognised flags', () => {
    const p = makeProgram();
    p.allowUnknownOption(false);
    expect(() => p.parse(['node', 'cobuild', '--unknown-flag'])).toThrow();
  });
});
