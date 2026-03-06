import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(os.homedir(), '.cobuild', 'logs', `cobuild-${date}.log`);
}

function formatEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
}

function writeToFile(filePath: string, line: string): void {
  try {
    fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // silently ignore file write errors to avoid crashing the CLI
  }
}

export class Logger {
  private logFilePath: string;
  private minLevel: LogLevel;

  constructor(logFilePath?: string, minLevel: LogLevel = 'debug') {
    this.logFilePath = logFilePath ?? getLogFilePath();
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  log(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    const line = formatEntry(entry);
    writeToFile(this.logFilePath, line);
  }

  debug(message: string): void {
    this.log('debug', message);
  }

  info(message: string): void {
    this.log('info', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  logError(message: string, err: unknown): void {
    const detail = err instanceof Error ? err.message : String(err);
    this.error(`${message}: ${detail}`);
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}

let _defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!_defaultLogger) {
    _defaultLogger = new Logger();
  }
  return _defaultLogger;
}
