import type { RuntimeConfig } from './config.js';
import { checkTTY, checkOllama } from '../validation/env.js';
import { bootstrapDirectories } from '../fs/bootstrap.js';
import { getLogger } from '../logging/logger.js';
import { createAndSaveSession } from '../session/session.js';

export interface StartupResult {
  success: boolean;
  message: string;
  sessionId?: string;
}

export async function runStartup(config: RuntimeConfig): Promise<StartupResult> {
  const logger = getLogger();

  logger.info(`cobuild v${config.version} starting`);
  logger.info(`new-session=${config.newSession}`);

  if (config.verbose) {
    logger.info('verbose mode enabled');
  }

  const ttyResult = checkTTY();
  logger.log(ttyResult.ok ? 'info' : 'error', `tty check: ${ttyResult.message}`);
  if (!ttyResult.ok) {
    return { success: false, message: ttyResult.message };
  }

  const ollamaResult = await checkOllama();
  logger.log(ollamaResult.ok ? 'info' : 'error', `ollama check: ${ollamaResult.message}`);
  if (!ollamaResult.ok) {
    return { success: false, message: ollamaResult.message };
  }

  const bootstrapResult = bootstrapDirectories();
  logger.log(bootstrapResult.ok ? 'info' : 'error', `bootstrap: ${bootstrapResult.message}`);
  if (!bootstrapResult.ok) {
    return { success: false, message: bootstrapResult.message };
  }

  let sessionId: string;
  try {
    const session = createAndSaveSession();
    logger.info(`active session: ${session.id}`);
    sessionId = session.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`session creation failed: ${message}`);
    return { success: false, message: `Failed to create session: ${message}` };
  }

  logger.info('startup complete');

  return { success: true, message: 'cobuild started successfully', sessionId };
}
