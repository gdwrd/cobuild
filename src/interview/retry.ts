import { getLogger } from '../logging/logger.js';

export const DEFAULT_MAX_ATTEMPTS = 5;

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly cause: Error;

  constructor(cause: Error, attempts: number) {
    super(`Model request failed after ${attempts} attempt(s): ${cause.message}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  onRetryExhausted?: (error: Error, attempts: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const logger = getLogger();
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        logger.warn(
          `retry: attempt ${attempt}/${maxAttempts} failed: ${lastError.message}; retrying...`,
        );
      } else {
        logger.error(
          `retry: attempt ${attempt}/${maxAttempts} failed: ${lastError.message}; all attempts exhausted`,
        );
      }
    }
  }

  const exhaustedError = new RetryExhaustedError(lastError, maxAttempts);
  options?.onRetryExhausted?.(lastError, maxAttempts);
  throw exhaustedError;
}
