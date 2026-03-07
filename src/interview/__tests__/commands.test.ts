import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { isSlashCommand, parseCommand, createCommandRouter } from '../commands.js';
import type { CommandResult } from '../commands.js';

describe('isSlashCommand', () => {
  it('returns true for slash-prefixed input', () => {
    expect(isSlashCommand('/finish-now')).toBe(true);
    expect(isSlashCommand('/model')).toBe(true);
    expect(isSlashCommand('/provider')).toBe(true);
  });

  it('returns true with leading whitespace', () => {
    expect(isSlashCommand('  /finish-now')).toBe(true);
  });

  it('returns false for regular input', () => {
    expect(isSlashCommand('hello world')).toBe(false);
    expect(isSlashCommand('')).toBe(false);
    expect(isSlashCommand('finish-now')).toBe(false);
  });
});

describe('parseCommand', () => {
  it('parses known commands', () => {
    expect(parseCommand('/finish-now')).toEqual({ command: '/finish-now', args: [] });
    expect(parseCommand('/model')).toEqual({ command: '/model', args: [] });
    expect(parseCommand('/provider')).toEqual({ command: '/provider', args: [] });
  });

  it('parses command with args', () => {
    expect(parseCommand('/model llama3')).toEqual({ command: '/model', args: ['llama3'] });
    expect(parseCommand('/model llama3 7b')).toEqual({
      command: '/model',
      args: ['llama3', '7b'],
    });
  });

  it('trims whitespace', () => {
    expect(parseCommand('  /finish-now  ')).toEqual({ command: '/finish-now', args: [] });
  });

  it('returns null for unknown commands', () => {
    expect(parseCommand('/unknown')).toBeNull();
    expect(parseCommand('/foo')).toBeNull();
  });

  it('returns null for non-slash input', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });
});

describe('createCommandRouter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls registered handler and returns its result', async () => {
    const result: CommandResult = { handled: true, continueInterview: false };
    const handler = vi.fn().mockResolvedValue(result);
    const route = createCommandRouter({ '/finish-now': handler });

    const output = await route({ command: '/finish-now', args: [] });

    expect(handler).toHaveBeenCalledWith([]);
    expect(output).toEqual(result);
  });

  it('returns unhandled result when no handler registered', async () => {
    const route = createCommandRouter({});
    const output = await route({ command: '/model', args: [] });

    expect(output).toEqual({ handled: false, continueInterview: true });
  });

  it('passes args to handler', async () => {
    const handler = vi.fn().mockResolvedValue({ handled: true, continueInterview: true });
    const route = createCommandRouter({ '/model': handler });

    await route({ command: '/model', args: ['llama3'] });

    expect(handler).toHaveBeenCalledWith(['llama3']);
  });
});
