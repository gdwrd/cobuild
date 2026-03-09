import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { isSlashCommand, parseCommand, createCommandRouter, HELP_MESSAGE, buildUnknownCommandMessage, KNOWN_COMMANDS, filterCommands, COMMAND_DEFINITIONS } from '../commands.js';
import type { CommandResult } from '../commands.js';

describe('KNOWN_COMMANDS', () => {
  it('includes /help', () => {
    expect(KNOWN_COMMANDS).toContain('/help');
  });

  it('includes /finish-now, /model, /provider', () => {
    expect(KNOWN_COMMANDS).toContain('/finish-now');
    expect(KNOWN_COMMANDS).toContain('/model');
    expect(KNOWN_COMMANDS).toContain('/provider');
  });
});

describe('HELP_MESSAGE', () => {
  it('mentions all known commands', () => {
    expect(HELP_MESSAGE).toContain('/finish-now');
    expect(HELP_MESSAGE).toContain('/model');
    expect(HELP_MESSAGE).toContain('/provider');
    expect(HELP_MESSAGE).toContain('/help');
  });
});

describe('buildUnknownCommandMessage', () => {
  it('includes the unknown command input', () => {
    const msg = buildUnknownCommandMessage('/foo');
    expect(msg).toContain('/foo');
  });

  it('includes the help message', () => {
    const msg = buildUnknownCommandMessage('/bar');
    expect(msg).toContain(HELP_MESSAGE);
  });
});

describe('isSlashCommand', () => {
  it('returns true for slash-prefixed input', () => {
    expect(isSlashCommand('/finish-now')).toBe(true);
    expect(isSlashCommand('/model')).toBe(true);
    expect(isSlashCommand('/provider')).toBe(true);
    expect(isSlashCommand('/help')).toBe(true);
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
    expect(parseCommand('/help')).toEqual({ command: '/help', args: [] });
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

describe('COMMAND_DEFINITIONS', () => {
  it('contains an entry for every KNOWN_COMMAND', () => {
    const definedNames = COMMAND_DEFINITIONS.map(d => d.name);
    for (const cmd of KNOWN_COMMANDS) {
      expect(definedNames).toContain(cmd);
    }
  });

  it('every entry has non-empty usage and description', () => {
    for (const def of COMMAND_DEFINITIONS) {
      expect(def.usage.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});

describe('filterCommands', () => {
  it('returns all commands for bare "/" prefix', () => {
    const results = filterCommands('/');
    expect(results).toHaveLength(COMMAND_DEFINITIONS.length);
  });

  it('filters to matching commands by prefix', () => {
    const results = filterCommands('/f');
    expect(results.map(r => r.name)).toEqual(['/finish-now']);
  });

  it('returns /model for "/m" prefix', () => {
    const results = filterCommands('/m');
    expect(results.map(r => r.name)).toEqual(['/model']);
  });

  it('returns /provider for "/p" prefix', () => {
    const results = filterCommands('/p');
    expect(results.map(r => r.name)).toEqual(['/provider']);
  });

  it('returns /help for "/he" prefix', () => {
    const results = filterCommands('/he');
    expect(results.map(r => r.name)).toEqual(['/help']);
  });

  it('returns empty array for non-slash prefix', () => {
    expect(filterCommands('model')).toEqual([]);
    expect(filterCommands('')).toEqual([]);
  });

  it('returns empty array when no command matches', () => {
    expect(filterCommands('/zzz')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const results = filterCommands('/F');
    expect(results.map(r => r.name)).toEqual(['/finish-now']);
  });

  it('returns exact match for full command name', () => {
    const results = filterCommands('/finish-now');
    expect(results.map(r => r.name)).toEqual(['/finish-now']);
  });

  it('includes usage and description on each result', () => {
    const results = filterCommands('/h');
    expect(results[0]).toHaveProperty('usage');
    expect(results[0]).toHaveProperty('description');
  });
});
