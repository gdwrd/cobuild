import type { RuntimeConfig } from './config.js';

export interface StartupResult {
  success: boolean;
  message: string;
}

function log(level: 'info' | 'warn' | 'error', message: string): void {
  const timestamp = new Date().toISOString();
  process.stderr.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
}

export async function runStartup(config: RuntimeConfig): Promise<StartupResult> {
  log('info', `cobuild v${config.version} starting`);
  log('info', `new-session=${config.newSession}`);

  if (config.verbose) {
    log('info', 'verbose mode enabled');
  }

  log('info', 'startup complete');

  return { success: true, message: 'cobuild started successfully' };
}
