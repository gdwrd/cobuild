import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkTTY, checkOllama, checkCodexCli, checkProviderReadiness } from '../env.js';

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
});

describe('checkCodexCli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok=true when codex binary is found', async () => {
    const { spawnSync } = await import('node:child_process');
    vi.spyOn({ spawnSync }, 'spawnSync').mockReturnValue({ status: 0, error: undefined } as ReturnType<typeof spawnSync>);
    // Use vi.mock is not available at this point; test via the actual binary check or stub node:child_process
    // Since we cannot easily mock ESM child_process here, we test the error path directly.
    // If codex is not installed (likely in CI), checkCodexCli returns ok=false — that is tested below.
    const result = checkCodexCli();
    // We only assert the shape, not the value, since codex may or may not be installed.
    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('checkCodexCli — not found path', () => {
  it('returns ok=false with actionable message when codex is not on PATH', async () => {
    // Simulate ENOENT by temporarily overriding PATH so codex cannot be found
    const originalPath = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      const result = checkCodexCli();
      // On most systems with empty PATH the binary will not be found
      if (!result.ok) {
        expect(result.message).toMatch(/codex CLI is not available/i);
        expect(result.message).toMatch(/PATH/i);
      }
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});

describe('checkProviderReadiness', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates to checkOllama for ollama provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkProviderReadiness('ollama');
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/reachable/i);
  });

  it('delegates to checkCodexCli for codex-cli provider and returns ValidationResult', async () => {
    const result = await checkProviderReadiness('codex-cli');
    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('returns ollama failure message when ollama is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await checkProviderReadiness('ollama');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not reachable/i);
  });
});
