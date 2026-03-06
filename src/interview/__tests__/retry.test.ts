import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, RetryExhaustedError, DEFAULT_MAX_ATTEMPTS } from '../retry.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('withRetry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds eventually', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 5 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RetryExhaustedError after all attempts fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('RetryExhaustedError has correct attempt count and cause', async () => {
    const cause = new Error('root cause');
    const fn = vi.fn().mockRejectedValue(cause);

    let thrown: RetryExhaustedError | undefined;
    try {
      await withRetry(fn, { maxAttempts: 3 });
    } catch (err) {
      thrown = err as RetryExhaustedError;
    }

    expect(thrown).toBeInstanceOf(RetryExhaustedError);
    expect(thrown!.attempts).toBe(3);
    expect(thrown!.cause).toBe(cause);
    expect(thrown!.message).toContain('3 attempt(s)');
  });

  it('defaults to DEFAULT_MAX_ATTEMPTS (5) attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn)).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('calls onRetryExhausted callback when attempts are exhausted', async () => {
    const onRetryExhausted = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry(fn, { maxAttempts: 2, onRetryExhausted })).rejects.toThrow(
      RetryExhaustedError,
    );

    expect(onRetryExhausted).toHaveBeenCalledTimes(1);
    expect(onRetryExhausted).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it('does not call onRetryExhausted if fn succeeds', async () => {
    const onRetryExhausted = vi.fn();
    const fn = vi.fn().mockResolvedValue('done');

    await withRetry(fn, { maxAttempts: 3, onRetryExhausted });
    expect(onRetryExhausted).not.toHaveBeenCalled();
  });

  it('wraps non-Error thrown values in an Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    let thrown: RetryExhaustedError | undefined;
    try {
      await withRetry(fn, { maxAttempts: 1 });
    } catch (err) {
      thrown = err as RetryExhaustedError;
    }

    expect(thrown).toBeInstanceOf(RetryExhaustedError);
    expect(thrown!.cause.message).toBe('string error');
  });
});
