import type { Logger } from '../logging/logger.js';

/**
 * Categorical error codes used to classify all cobuild runtime errors.
 */
export type CobuildErrorCode =
  | 'NETWORK'
  | 'FILE_SYSTEM'
  | 'SESSION'
  | 'VALIDATION'
  | 'RETRY_EXHAUSTED'
  | 'UNKNOWN';

/**
 * Structured error type for cobuild. Carries a code, a clean user-facing
 * message, and the original cause. The `message` property (inherited from
 * Error) equals `userMessage` so it is safe to log as-is.
 */
export class CobuildError extends Error {
  readonly code: CobuildErrorCode;
  readonly userMessage: string;

  constructor(code: CobuildErrorCode, userMessage: string, cause?: Error) {
    super(userMessage, cause !== undefined ? { cause } : undefined);
    this.name = 'CobuildError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

// ---------------------------------------------------------------------------
// Internal classification helpers
// ---------------------------------------------------------------------------

const FS_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EISDIR', 'ENOTDIR']);

const NETWORK_ERROR_NAMES = new Set(['AbortError', 'FetchError', 'TypeError']);

const NETWORK_MSG_PATTERNS: RegExp[] = [
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
  /connection timed out/i,
  /network socket/i,
  /fetch failed/i,
];

const VALIDATION_ERROR_NAMES = new Set([
  'SpecValidationError',
  'ArchValidationError',
  'PlanValidationError',
  'DevPlanValidationError',
]);

function classifyError(err: Error): CobuildErrorCode {
  if (err.name === 'RetryExhaustedError') return 'RETRY_EXHAUSTED';
  if (VALIDATION_ERROR_NAMES.has(err.name)) return 'VALIDATION';

  const nodeErr = err as NodeJS.ErrnoException;
  if (nodeErr.code !== undefined && FS_ERROR_CODES.has(nodeErr.code)) return 'FILE_SYSTEM';

  // Network check: name first, then message patterns
  if (NETWORK_ERROR_NAMES.has(err.name)) {
    const msg = err.message;
    // TypeError is only network when the message looks like a fetch failure
    if (err.name !== 'TypeError' || NETWORK_MSG_PATTERNS.some((p) => p.test(msg))) {
      return 'NETWORK';
    }
  }

  const msg = err.message;
  for (const pattern of NETWORK_MSG_PATTERNS) {
    if (pattern.test(msg)) return 'NETWORK';
  }

  return 'UNKNOWN';
}

function buildUserMessage(code: CobuildErrorCode, err: Error): string {
  switch (code) {
    case 'NETWORK':
      return `Network error: ${err.message}`;
    case 'FILE_SYSTEM':
      return `File system error: ${err.message}`;
    case 'SESSION':
      return `Session error: ${err.message}`;
    case 'VALIDATION':
      return `Validation failed: ${err.message}`;
    case 'RETRY_EXHAUSTED':
      // RetryExhaustedError already produces a good message
      return err.message;
    case 'UNKNOWN':
    default:
      return err.message;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classifies any thrown value into a `CobuildError` with a structured error
 * code and a clean user-facing message. Already-classified `CobuildError`
 * instances are returned unchanged.
 */
export function mapError(err: unknown): CobuildError {
  if (err instanceof CobuildError) return err;

  const error = err instanceof Error ? err : new Error(String(err));
  const code = classifyError(error);
  const userMessage = buildUserMessage(code, error);
  return new CobuildError(code, userMessage, error);
}

/**
 * Returns a clean, user-facing error message with no stack trace.
 * Safe to display directly in terminal UI.
 */
export function formatUserMessage(err: unknown): string {
  if (err instanceof CobuildError) return err.userMessage;
  return mapError(err).userMessage;
}

/**
 * Logs the full error details — message, name, stack — to the provided
 * logger. This should be called whenever an error is caught, before showing
 * the clean `formatUserMessage` to the user.
 */
export function logFullError(logger: Logger, context: string, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const stack = error.stack ?? `${error.name}: ${error.message} (no stack available)`;
  logger.error(`${context}: ${error.message} [${error.name}]\n${stack}`);
}
