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

  it('does not write debug entries by default (default minLevel is info)', () => {
    const logger = new Logger(logFile);
    logger.debug('should not appear');
    logger.info('should appear');

    const contents = fs.readFileSync(logFile, 'utf8');
    expect(contents).not.toContain('should not appear');
    expect(contents).toContain('should appear');
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
});
