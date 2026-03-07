import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodexCliProvider, buildCodexPrompt } from '../codex-cli.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockStdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() };
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

describe('buildCodexPrompt', () => {
  it('formats system message with System: prefix', () => {
    const result = buildCodexPrompt([{ role: 'system', content: 'You are a helpful assistant.' }]);
    expect(result).toBe('System: You are a helpful assistant.');
  });

  it('formats user message with User: prefix', () => {
    const result = buildCodexPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toBe('User: Hello');
  });

  it('formats assistant message with Assistant: prefix', () => {
    const result = buildCodexPrompt([{ role: 'assistant', content: 'Hi there' }]);
    expect(result).toBe('Assistant: Hi there');
  });

  it('joins multiple messages with double newline', () => {
    const result = buildCodexPrompt([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'User input' },
      { role: 'assistant', content: 'Assistant reply' },
    ]);
    expect(result).toBe('System: System prompt\n\nUser: User input\n\nAssistant: Assistant reply');
  });
});

describe('CodexCliProvider', () => {
  function mockSuccess(stdout: string) {
    mockExecFile.mockImplementationOnce(
      (_file: string, _args: string[], _opts: object, callback: (err: null, stdout: string, stderr: string) => void) => {
        callback(null, stdout, '');
        return { stdin: mockStdin };
      },
    );
  }

  function mockFailure(err: Error) {
    mockExecFile.mockImplementationOnce(
      (_file: string, _args: string[], _opts: object, callback: (err: Error, stdout: string, stderr: string) => void) => {
        callback(err, '', '');
        return { stdin: mockStdin };
      },
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns trimmed stdout on success', async () => {
    mockSuccess('  response text  ');

    const provider = new CodexCliProvider();
    const result = await provider.generate([{ role: 'user', content: 'Hello' }]);

    expect(result).toBe('response text');
  });

  it('calls codex with the formatted prompt via stdin', async () => {
    mockSuccess('ok');

    const provider = new CodexCliProvider();
    await provider.generate([
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(mockExecFile).toHaveBeenCalledWith(
      'codex',
      ['--quiet'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function),
    );
    expect(mockStdin.write).toHaveBeenCalledWith('System: Sys\n\nUser: Hi', 'utf8');
    expect(mockStdin.end).toHaveBeenCalled();
  });

  it('throws when stdout is whitespace only', async () => {
    mockSuccess('   ');

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI returned empty response',
    );
  });

  it('throws wrapped error when codex exits non-zero', async () => {
    mockFailure(new Error('Command failed: codex exited with code 1'));

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed:',
    );
  });

  it('throws wrapped error when codex binary is not found', async () => {
    mockFailure(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }));

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: spawn codex ENOENT',
    );
  });

  it('throws timeout error when process is killed', async () => {
    mockFailure(Object.assign(new Error('killed'), { killed: true }));

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: timed out after',
    );
  });

  it('throws timeout error for ETIMEDOUT code', async () => {
    mockFailure(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }));

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: timed out after',
    );
  });
});
