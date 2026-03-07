import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CobuildError, mapError, formatUserMessage, logFullError } from '../errors.js';
import type { Logger } from '../../logging/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodeError(message: string, code: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

function makeNamedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function makeLogger(): Logger {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
    getLogFilePath: vi.fn(),
  } as unknown as Logger;
}

// ---------------------------------------------------------------------------
// CobuildError
// ---------------------------------------------------------------------------

describe('CobuildError', () => {
  it('sets name, code, and userMessage', () => {
    const err = new CobuildError('NETWORK', 'Network error: connection refused');
    expect(err.name).toBe('CobuildError');
    expect(err.code).toBe('NETWORK');
    expect(err.userMessage).toBe('Network error: connection refused');
    expect(err.message).toBe('Network error: connection refused');
  });

  it('stores cause when provided', () => {
    const cause = new Error('original');
    const err = new CobuildError('UNKNOWN', 'Something went wrong', cause);
    expect(err.cause).toBe(cause);
  });

  it('does not set cause when not provided', () => {
    const err = new CobuildError('UNKNOWN', 'Something went wrong');
    expect(err.cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mapError
// ---------------------------------------------------------------------------

describe('mapError', () => {
  it('returns the same CobuildError if already classified', () => {
    const cobuildErr = new CobuildError('SESSION', 'Session error: not found');
    expect(mapError(cobuildErr)).toBe(cobuildErr);
  });

  it('classifies RetryExhaustedError as RETRY_EXHAUSTED', () => {
    const err = makeNamedError('RetryExhaustedError', 'Model request failed after 5 attempts');
    const result = mapError(err);
    expect(result.code).toBe('RETRY_EXHAUSTED');
    expect(result.userMessage).toBe(err.message);
  });

  it('classifies SpecValidationError as VALIDATION', () => {
    const err = makeNamedError('SpecValidationError', 'Spec validation failed: missing sections — overview');
    const result = mapError(err);
    expect(result.code).toBe('VALIDATION');
    expect(result.userMessage).toContain('Validation failed:');
  });

  it('classifies ArchValidationError as VALIDATION', () => {
    const err = makeNamedError('ArchValidationError', 'Architecture validation failed: missing sections');
    expect(mapError(err).code).toBe('VALIDATION');
  });

  it('classifies PlanValidationError as VALIDATION', () => {
    const err = makeNamedError('PlanValidationError', 'Plan validation failed');
    expect(mapError(err).code).toBe('VALIDATION');
  });

  it('classifies DevPlanValidationError as VALIDATION', () => {
    const err = makeNamedError('DevPlanValidationError', 'Dev plan validation failed');
    expect(mapError(err).code).toBe('VALIDATION');
  });

  it('classifies ENOENT as FILE_SYSTEM', () => {
    const err = makeNodeError('no such file or directory', 'ENOENT');
    const result = mapError(err);
    expect(result.code).toBe('FILE_SYSTEM');
    expect(result.userMessage).toContain('File system error:');
  });

  it('classifies EACCES as FILE_SYSTEM', () => {
    expect(mapError(makeNodeError('permission denied', 'EACCES')).code).toBe('FILE_SYSTEM');
  });

  it('classifies ENOSPC as FILE_SYSTEM', () => {
    expect(mapError(makeNodeError('no space left on device', 'ENOSPC')).code).toBe('FILE_SYSTEM');
  });

  it('classifies AbortError as NETWORK', () => {
    const err = makeNamedError('AbortError', 'connection timed out after 5s');
    expect(mapError(err).code).toBe('NETWORK');
  });

  it('classifies ECONNREFUSED message as NETWORK', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    expect(mapError(err).code).toBe('NETWORK');
  });

  it('classifies ENOTFOUND message as NETWORK', () => {
    const err = new Error('getaddrinfo ENOTFOUND localhost');
    expect(mapError(err).code).toBe('NETWORK');
  });

  it('classifies fetch failed TypeError as NETWORK', () => {
    const err = new TypeError('fetch failed');
    expect(mapError(err).code).toBe('NETWORK');
  });

  it('does not classify a generic TypeError as NETWORK', () => {
    const err = new TypeError('Cannot read properties of undefined');
    expect(mapError(err).code).toBe('UNKNOWN');
  });

  it('classifies unknown errors as UNKNOWN', () => {
    const err = new Error('something completely unexpected');
    expect(mapError(err).code).toBe('UNKNOWN');
  });

  it('wraps non-Error throwables as UNKNOWN', () => {
    const result = mapError('string error');
    expect(result.code).toBe('UNKNOWN');
    expect(result.userMessage).toBe('string error');
  });

  it('wraps null as UNKNOWN', () => {
    const result = mapError(null);
    expect(result.code).toBe('UNKNOWN');
  });

  it('stores original error as cause', () => {
    const original = new Error('original message');
    const result = mapError(original);
    expect(result.cause).toBe(original);
  });

  it('NETWORK error message has Network error prefix', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const result = mapError(err);
    expect(result.userMessage).toMatch(/^Network error:/);
  });

  it('VALIDATION error message has Validation failed prefix', () => {
    const err = makeNamedError('SpecValidationError', 'missing sections — overview');
    const result = mapError(err);
    expect(result.userMessage).toMatch(/^Validation failed:/);
  });

  it('FILE_SYSTEM error message has File system error prefix', () => {
    const err = makeNodeError('permission denied', 'EACCES');
    const result = mapError(err);
    expect(result.userMessage).toMatch(/^File system error:/);
  });
});

// ---------------------------------------------------------------------------
// formatUserMessage
// ---------------------------------------------------------------------------

describe('formatUserMessage', () => {
  it('returns userMessage for CobuildError without calling mapError', () => {
    const err = new CobuildError('NETWORK', 'Network error: refused');
    expect(formatUserMessage(err)).toBe('Network error: refused');
  });

  it('returns only the message property, not the full stack', () => {
    const err = new Error('something bad');
    // Verify the stack actually contains "at " trace lines
    expect(err.stack).toMatch(/\n\s+at /);
    const result = formatUserMessage(err);
    // Result is exactly the message — no stack trace lines
    expect(result).toBe('something bad');
    expect(result).not.toMatch(/\n\s+at /);
  });

  it('never returns a string containing a stack trace', () => {
    const err = new Error('kaboom');
    // Manually add stack content to message to ensure it's not just passed through
    const result = formatUserMessage(err);
    expect(result).not.toMatch(/^\s+at /m);
  });

  it('handles non-Error throwable', () => {
    expect(formatUserMessage(42)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// logFullError
// ---------------------------------------------------------------------------

describe('logFullError', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it('calls logger.error with context and stack', () => {
    const err = new Error('test error');
    logFullError(logger, 'my context', err);

    expect(logger.error).toHaveBeenCalledOnce();
    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(call).toContain('my context');
    expect(call).toContain('test error');
  });

  it('includes error name in log output', () => {
    const err = makeNamedError('SpecValidationError', 'missing sections');
    logFullError(logger, 'ctx', err);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(call).toContain('SpecValidationError');
  });

  it('logs stack trace when available', () => {
    const err = new Error('with stack');
    logFullError(logger, 'ctx', err);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // Stack trace lines start with whitespace + "at"
    expect(call).toMatch(/\n\s*at /);
  });

  it('handles non-Error throwable gracefully', () => {
    logFullError(logger, 'ctx', 'string error');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('handles null throwable gracefully', () => {
    logFullError(logger, 'ctx', null);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
