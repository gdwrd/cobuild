import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '../logger.js';

describe('Logger', () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-logger-test-'));
    logFile = path.join(tmpDir, 'test.log');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes an info entry to the log file', () => {
    const logger = new Logger(logFile);
    logger.info('hello world');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[INFO] hello world');
  });

  it('writes a warn entry', () => {
    const logger = new Logger(logFile);
    logger.warn('something might be wrong');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[WARN] something might be wrong');
  });

  it('writes an error entry', () => {
    const logger = new Logger(logFile);
    logger.error('something went wrong');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[ERROR] something went wrong');
  });

  it('writes a debug entry when minLevel is debug', () => {
    const logger = new Logger(logFile, 'debug');
    logger.debug('debug info');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[DEBUG] debug info');
  });

  it('writes debug entries by default (default minLevel is debug)', () => {
    const logger = new Logger(logFile);
    logger.debug('should appear');
    logger.info('also appears');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('should appear');
    expect(contents).toContain('also appears');
  });

  it('includes a timestamp in ISO format', () => {
    const logger = new Logger(logFile);
    logger.info('timestamped');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('appends multiple entries', () => {
    const logger = new Logger(logFile);
    logger.info('first');
    logger.info('second');

    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });

  it('respects minLevel and skips lower-level messages', () => {
    const logger = new Logger(logFile, 'warn');
    logger.debug('skip me');
    logger.info('skip me too');
    logger.warn('include me');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).not.toContain('skip me');
    expect(contents).toContain('include me');
  });

  it('logError includes error message detail', () => {
    const logger = new Logger(logFile);
    logger.logError('operation failed', new Error('disk full'));

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[ERROR] operation failed: disk full');
  });

  it('logError handles non-Error values', () => {
    const logger = new Logger(logFile);
    logger.logError('operation failed', 'some string error');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[ERROR] operation failed: some string error');
  });

  it('getLogFilePath returns the configured path', () => {
    const logger = new Logger(logFile);
    expect(logger.getLogFilePath()).toBe(logFile);
  });

  it('does not throw if log directory is missing', () => {
    const missingPath = path.join(tmpDir, 'nonexistent', 'test.log');
    const logger = new Logger(missingPath);
    expect(() => logger.info('silent fail')).not.toThrow();
  });

  // Timestamp verification
  it('includes a full ISO timestamp (date and time) in every log entry', () => {
    const logger = new Logger(logFile);
    logger.debug('debug entry');
    logger.info('info entry');
    logger.warn('warn entry');
    logger.error('error entry');

    const contents = fs.readFileSync(logFile, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      // e.g. [2026-03-07T13:00:00.000Z]
      expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]/);
    }
  });

  // Session ID convention: messages that include a session ID are traceable
  it('preserves session ID when included in log message', () => {
    const logger = new Logger(logFile);
    const sessionId = 'abc-123-session';
    logger.info(`stage transition: spec complete (session ${sessionId})`);

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain(sessionId);
    expect(contents).toContain('stage transition');
  });

  // Raw provider data capture
  it('captures debug-level provider request logs by default', () => {
    const logger = new Logger(logFile); // default minLevel = 'debug'
    const requestBody = JSON.stringify({ model: 'llama3', messages: [{ role: 'user', content: 'hello' }] });
    logger.debug(`ollama: raw request body: ${requestBody}`);

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[DEBUG]');
    expect(contents).toContain('ollama: raw request body:');
    expect(contents).toContain('llama3');
  });

  it('captures debug-level provider response logs by default', () => {
    const logger = new Logger(logFile);
    const responseBody = JSON.stringify({ message: { content: 'Hello!' }, done: true });
    logger.debug(`ollama: raw response body: ${responseBody}`);

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[DEBUG]');
    expect(contents).toContain('ollama: raw response body:');
    expect(contents).toContain('Hello!');
  });

  // Stage transition coverage
  it('logs stage transitions at info level', () => {
    const logger = new Logger(logFile);
    logger.info('spec stage complete: transitioning to architecture stage (session sess-1)');
    logger.info('architecture stage complete: transitioning to plan stage (session sess-1)');
    logger.info('plan stage complete (session sess-1)');
    logger.info('dev-plan stage complete (session sess-1)');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('spec stage complete');
    expect(contents).toContain('architecture stage complete');
    expect(contents).toContain('plan stage complete');
    expect(contents).toContain('dev-plan stage complete');
    expect(contents.match(/sess-1/g)).toHaveLength(4);
  });

  // Retry event coverage
  it('logs retry attempts at warn level and exhaustion at error level', () => {
    const logger = new Logger(logFile);
    logger.warn('retry: attempt 1/5 failed: connection refused; retrying in 2000ms...');
    logger.error('retry: attempt 5/5 failed: connection refused; all attempts exhausted');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[WARN]');
    expect(contents).toContain('retry: attempt 1/5 failed');
    expect(contents).toContain('[ERROR]');
    expect(contents).toContain('all attempts exhausted');
  });

  // File creation coverage
  it('logs file creation events at info level', () => {
    const logger = new Logger(logFile);
    logger.info('file-output: created docs directory at /tmp/project/docs');
    logger.info('file-output: writing artifact to /tmp/project/docs/spec.md');
    logger.info('file-output: artifact written successfully to /tmp/project/docs/spec.md');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('file-output: created docs directory');
    expect(contents).toContain('file-output: writing artifact to');
    expect(contents).toContain('file-output: artifact written successfully');
  });

  // Runtime error coverage
  it('logs runtime errors at error level with full message', () => {
    const logger = new Logger(logFile);
    logger.error('session load: corrupted JSON in session file /path/to/session.json, skipping');
    logger.logError('artifact generation failed', new Error('validation: missing required heading'));

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).toContain('[ERROR]');
    expect(contents).toContain('corrupted JSON');
    expect(contents).toContain('validation: missing required heading');
  });
});
