import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkTTY, checkOllama } from '../env.js';

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
