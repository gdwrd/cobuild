import type { RuntimeConfig } from './config.js';
import { checkTTY, checkOllama } from '../validation/env.js';

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

  const ttyResult = checkTTY();
  log(ttyResult.ok ? 'info' : 'error', `tty check: ${ttyResult.message}`);
  if (!ttyResult.ok) {
    return { success: false, message: ttyResult.message };
  }

  const ollamaResult = await checkOllama();
  log(ollamaResult.ok ? 'info' : 'error', `ollama check: ${ollamaResult.message}`);
  if (!ollamaResult.ok) {
    return { success: false, message: ollamaResult.message };
  }

  log('info', 'startup complete');

  return { success: true, message: 'cobuild started successfully' };
}
