import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { checkTTY, checkOllama, checkCodexCli, checkProviderReadiness } from '../env.js';

const mockSpawnSync = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
}));

describe('checkTTY', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok=true when stdin is a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const result = checkTTY();
    expect(result.ok).toBe(true);
    expect(result.message).toBeTruthy();
  });

  it('returns ok=false when stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    const result = checkTTY();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/interactive terminal/i);
  });

  it('returns ok=false when stdin.isTTY is false', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const result = checkTTY();
    expect(result.ok).toBe(false);
  });
});

describe('checkOllama', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok=true when Ollama responds with 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkOllama();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/reachable/i);
  });

  it('returns ok=false when Ollama responds with non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await checkOllama();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/503/);
  });

  it('returns ok=false when fetch throws (connection refused)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await checkOllama();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not reachable/i);
  });

  it('returns ok=false with timeout message on AbortError', async () => {
    const err = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    const result = await checkOllama();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/timed out/i);
  });

  it('uses the provided baseUrl', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);
    await checkOllama('http://localhost:9999');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/tags',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('success message mentions Ollama by name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkOllama();
    expect(result.message).toMatch(/Ollama/);
  });

  it('non-200 failure message mentions Ollama by name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await checkOllama();
    expect(result.message).toMatch(/Ollama/);
  });

  it('connection error message mentions Ollama by name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await checkOllama();
    expect(result.message).toMatch(/Ollama/);
  });
});

describe('checkCodexCli', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns ok=true when codex exits with status 0', () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined, signal: null });
    const result = checkCodexCli();
    expect(result.ok).toBe(true);
    expect(result.message).toBe('codex CLI is available');
  });

  it('returns ok=false with actionable message when codex binary is not found (ENOENT)', () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' }),
      signal: null,
    });
    const result = checkCodexCli();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/codex CLI is not available/i);
    expect(result.message).toMatch(/PATH/i);
  });

  it('failure message mentions codex CLI by name', () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' }),
      signal: null,
    });
    const result = checkCodexCli();
    expect(result.message).toMatch(/codex/i);
  });

  it('returns ok=false when codex exits with non-zero status', () => {
    mockSpawnSync.mockReturnValue({ status: 1, error: undefined, signal: null });
    const result = checkCodexCli();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/codex CLI is not available/i);
    expect(result.message).toMatch(/exited with code 1/i);
  });

  it('returns ok=false when codex is killed by signal', () => {
    mockSpawnSync.mockReturnValue({ status: null, error: undefined, signal: 'SIGTERM' });
    const result = checkCodexCli();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/codex CLI is not available/i);
    expect(result.message).toMatch(/SIGTERM/);
  });
});

describe('checkProviderReadiness', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates to checkOllama for ollama provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkProviderReadiness('ollama');
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/reachable/i);
  });

  it('delegates to checkCodexCli for codex-cli provider and returns ok=true when binary is available', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined, signal: null });
    const result = await checkProviderReadiness('codex-cli');
    expect(result.ok).toBe(true);
    expect(result.message).toBe('codex CLI is available');
  });

  it('returns ollama failure message when ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await checkProviderReadiness('ollama');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not reachable/i);
  });

  it('ollama failure message from checkProviderReadiness mentions Ollama by name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await checkProviderReadiness('ollama');
    expect(result.message).toMatch(/Ollama/);
  });

  it('codex-cli failure message from checkProviderReadiness mentions codex by name', async () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' }),
      signal: null,
    });
    const result = await checkProviderReadiness('codex-cli');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/codex/i);
  });
});
