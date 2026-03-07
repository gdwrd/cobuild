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

const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
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
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns trimmed stdout on success', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '  response text  ', stderr: '' });

    const provider = new CodexCliProvider();
    const result = await provider.generate([{ role: 'user', content: 'Hello' }]);

    expect(result).toBe('response text');
  });

  it('calls codex with --quiet and the formatted prompt', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: 'ok', stderr: '' });

    const provider = new CodexCliProvider();
    await provider.generate([
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(mockExecFile).toHaveBeenCalledWith(
      'codex',
      ['--quiet', '--', 'System: Sys\n\nUser: Hi'],
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('returns empty string when stdout is whitespace only', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '   ', stderr: '' });

    const provider = new CodexCliProvider();
    const result = await provider.generate([{ role: 'user', content: 'Hi' }]);

    expect(result).toBe('');
  });

  it('throws wrapped error when codex exits non-zero', async () => {
    mockExecFile.mockRejectedValueOnce(new Error('Command failed: codex exited with code 1'));

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed:',
    );
  });

  it('throws wrapped error when codex binary is not found', async () => {
    const err = Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
    mockExecFile.mockRejectedValueOnce(err);

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: spawn codex ENOENT',
    );
  });

  it('throws timeout error when process is killed', async () => {
    const err = Object.assign(new Error('killed'), { killed: true });
    mockExecFile.mockRejectedValueOnce(err);

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: timed out after',
    );
  });

  it('throws timeout error for ETIMEDOUT code', async () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    mockExecFile.mockRejectedValueOnce(err);

    const provider = new CodexCliProvider();
    await expect(provider.generate([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'codex CLI failed: timed out after',
    );
  });
});
