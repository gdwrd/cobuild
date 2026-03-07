import type { RuntimeConfig } from './config.js';
import { checkTTY, checkOllama } from '../validation/env.js';
import { bootstrapDirectories } from '../fs/bootstrap.js';
import { getLogger } from '../logging/logger.js';
import { createAndSaveSession, findLatestByWorkingDirectory } from '../session/session.js';

export type SessionResolution = 'new' | 'resumed';

export interface StartupResult {
  success: boolean;
  message: string;
  sessionId?: string;
  sessionResolution?: SessionResolution;
  sessionStage?: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';
}

export async function runStartup(config: RuntimeConfig): Promise<StartupResult> {
  const bootstrapResult = bootstrapDirectories();

  const logger = getLogger();
  logger.info(`cobuild v${config.version} starting`);
  logger.info(`new-session=${config.newSession}`);

  if (config.verbose) {
    logger.info('verbose mode enabled');
  }

  logger.log(bootstrapResult.ok ? 'info' : 'error', `bootstrap: ${bootstrapResult.message}`);
  if (!bootstrapResult.ok) {
    return { success: false, message: bootstrapResult.message };
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

  let sessionId: string;
  let sessionResolution: SessionResolution;
  let sessionStage: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans' | undefined;
  try {
    if (config.newSession) {
      logger.info('--new-session flag set, forcing new session');
      const session = createAndSaveSession();
      sessionId = session.id;
      sessionResolution = 'new';
      logger.info(`new session created: ${session.id}`);
    } else {
      const existing = findLatestByWorkingDirectory(process.cwd());
      const isResumeableExisting =
        existing &&
        (!existing.completed ||
          (existing.stage === 'dev-plans' && !existing.devPlansComplete));
      if (isResumeableExisting) {
        logger.info(`resuming existing session: ${existing.id}`);
        sessionId = existing.id;
        sessionResolution = 'resumed';
        sessionStage = existing.stage;
      } else {
        if (existing && (existing.completed || existing.devPlansComplete)) {
          logger.info(`latest session completed, starting new session (was: ${existing.id})`);
        } else {
          logger.info('no existing session found for working directory, starting new session');
        }
        const session = createAndSaveSession();
        sessionId = session.id;
        sessionResolution = 'new';
        logger.info(`new session created: ${session.id}`);
      }
    }
    logger.info(`active session: ${sessionId} (${sessionResolution})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`session resolution failed: ${message}`);
    return { success: false, message: `Failed to resolve session: ${message}` };
  }

  logger.info('startup complete');

  return { success: true, message: 'cobuild started successfully', sessionId, sessionResolution, sessionStage };
}
