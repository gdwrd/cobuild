import type { RuntimeConfig } from './config.js';
import type { ProviderName } from '../session/session.js';
import { checkTTY, checkProviderReadiness } from '../validation/env.js';
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

function isResumeable(session: ReturnType<typeof findLatestByWorkingDirectory>): boolean {
  return !!(
    session &&
    (!session.completed || (session.stage === 'dev-plans' && !session.devPlansComplete))
  );
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

  // Determine effective provider before running the readiness check.
  // For resumed sessions the provider is taken from the saved session, not from config.
  let effectiveProvider: ProviderName = config.provider;
  let existingSession: ReturnType<typeof findLatestByWorkingDirectory> = null;

  if (!config.newSession) {
    existingSession = findLatestByWorkingDirectory(process.cwd());
    if (isResumeable(existingSession)) {
      effectiveProvider = existingSession!.provider ?? 'ollama';
    }
  }

  const providerResult = await checkProviderReadiness(effectiveProvider);
  logger.log(
    providerResult.ok ? 'info' : 'error',
    `provider check (${effectiveProvider}): ${providerResult.message}`,
  );
  if (!providerResult.ok) {
    return { success: false, message: providerResult.message };
  }

  let sessionId: string;
  let sessionResolution: SessionResolution;
  let sessionStage: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans' | undefined;
  try {
    if (config.newSession) {
      logger.info('--new-session flag set, forcing new session');
      const session = createAndSaveSession(config.provider);
      sessionId = session.id;
      sessionResolution = 'new';
      logger.info(`new session created: ${session.id} (provider=${config.provider})`);
    } else {
      if (isResumeable(existingSession) && existingSession) {
        logger.info(
          `resuming existing session: ${existingSession.id} at stage ${existingSession.stage ?? 'interview'} (provider=${existingSession.provider ?? 'ollama'})`,
        );
        sessionId = existingSession.id;
        sessionResolution = 'resumed';
        sessionStage = existingSession.stage;
      } else {
        if (existingSession) {
          logger.info(`latest session is complete, starting new session (was: ${existingSession.id})`);
        } else {
          logger.info('no existing session found for working directory, starting new session');
        }
        const session = createAndSaveSession(config.provider);
        sessionId = session.id;
        sessionResolution = 'new';
        logger.info(`new session created: ${session.id} (provider=${config.provider})`);
      }
    }
    logger.info(`active session: ${sessionId} (${sessionResolution}, provider=${effectiveProvider})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`session resolution failed: ${message}`);
    return { success: false, message: `Failed to resolve session: ${message}` };
  }

  logger.info('startup complete');

  return { success: true, message: 'cobuild started successfully', sessionId, sessionResolution, sessionStage };
}
