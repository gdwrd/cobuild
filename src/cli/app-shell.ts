import type { RuntimeConfig } from './config.js';
import type { ProviderName } from '../session/session.js';
import { checkTTY, checkProviderReadiness } from '../validation/env.js';
import { bootstrapDirectories } from '../fs/bootstrap.js';
import { getLogger } from '../logging/logger.js';
import { createAndSaveSession, findLatestByWorkingDirectory } from '../session/session.js';

export type SessionResolution = 'new' | 'resumed';

export interface ProviderReadinessStatus {
  provider: ProviderName;
  ok: boolean;
  message: string;
}

export interface StartupResult {
  success: boolean;
  message: string;
  sessionId?: string;
  sessionResolution?: SessionResolution;
  sessionStage?: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';
  activeProvider?: ProviderName;
  providerStatuses?: ProviderReadinessStatus[];
  startupNotice?: string;
}

/** A single named step shown in the staged startup screen. */
export interface StartupStep {
  id: 'bootstrap' | 'tty' | 'provider' | 'session';
  label: string;
  status: 'pending' | 'running' | 'ok' | 'warning' | 'failed';
  /** Optional short detail shown alongside the step status. */
  detail?: string;
}

/** Callback invoked with the current step list whenever any step changes. */
export type StartupProgressCallback = (steps: ReadonlyArray<StartupStep>) => void;

/**
 * A channel for subscribing to startup progress events.
 * Create one before calling `runStartup` and pass it to both.
 * Buffers events emitted before a listener is registered.
 */
export interface StartupProgressChannel {
  /** Register a listener. Immediately replays any buffered events. */
  subscribe: (listener: StartupProgressCallback) => void;
}

function isResumeable(session: ReturnType<typeof findLatestByWorkingDirectory>): boolean {
  return !!(
    session &&
    (!session.completed || (session.stage === 'dev-plans' && !session.devPlansComplete))
  );
}

export async function runStartup(
  config: RuntimeConfig,
  onProgress?: StartupProgressCallback,
): Promise<StartupResult> {
  const steps: StartupStep[] = [
    { id: 'bootstrap', label: 'Initializing directories', status: 'running' },
    { id: 'tty', label: 'Checking TTY', status: 'pending' },
    { id: 'provider', label: 'Checking provider', status: 'pending' },
    { id: 'session', label: 'Resolving session', status: 'pending' },
  ];

  const emit = () => onProgress?.([...steps]);

  emit();

  const logger = getLogger();
  logger.info(`cobuild v${config.version} starting`);
  logger.info(`new-session=${config.newSession}`);

  if (config.verbose) {
    logger.info('verbose mode enabled');
  }

  const bootstrapResult = bootstrapDirectories();
  logger.log(bootstrapResult.ok ? 'info' : 'error', `bootstrap: ${bootstrapResult.message}`);
  steps[0] = { ...steps[0], status: bootstrapResult.ok ? 'ok' : 'failed', detail: bootstrapResult.ok ? undefined : bootstrapResult.message };
  emit();

  if (!bootstrapResult.ok) {
    return { success: false, message: bootstrapResult.message };
  }

  steps[1] = { ...steps[1], status: 'running' };
  emit();

  const ttyResult = checkTTY();
  logger.log(ttyResult.ok ? 'info' : 'error', `tty check: ${ttyResult.message}`);
  steps[1] = { ...steps[1], status: ttyResult.ok ? 'ok' : 'failed', detail: ttyResult.ok ? undefined : ttyResult.message };
  emit();

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

  steps[2] = { ...steps[2], status: 'running', label: `Checking provider (${effectiveProvider})` };
  emit();

  const providerChecks = await Promise.all([
    checkProviderReadiness('ollama'),
    checkProviderReadiness('codex-cli'),
  ]);
  const providerStatuses: ProviderReadinessStatus[] = [
    { provider: 'ollama', ...providerChecks[0] },
    { provider: 'codex-cli', ...providerChecks[1] },
  ];
  const providerResult =
    providerStatuses.find((status) => status.provider === effectiveProvider) ??
    providerStatuses[0];
  logger.log(
    providerResult.ok ? 'info' : 'error',
    `provider check (${effectiveProvider}): ${providerResult.message}`,
  );
  const availableProviders = providerStatuses.filter((status) => status.ok);
  const startupNotice =
    availableProviders.length === 0
      ? `No AI providers are currently available. Ollama: ${providerStatuses[0].message} Codex CLI: ${providerStatuses[1].message}`
      : !providerResult.ok
        ? `Active provider ${effectiveProvider} is not available yet. ${providerResult.message}`
        : undefined;

  steps[2] = {
    ...steps[2],
    status: providerResult.ok ? 'ok' : 'warning',
    detail: providerResult.ok ? undefined : providerResult.message,
  };
  emit();

  steps[3] = { ...steps[3], status: 'running' };
  emit();

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
    steps[3] = { ...steps[3], status: 'ok', detail: sessionResolution === 'resumed' ? `resumed (${sessionStage ?? 'interview'})` : 'new session' };
    emit();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`session resolution failed: ${message}`);
    steps[3] = { ...steps[3], status: 'failed', detail: message };
    emit();
    return { success: false, message: `Failed to resolve session: ${message}` };
  }

  logger.info('startup complete');

  return {
    success: true,
    message: 'cobuild started successfully',
    sessionId,
    sessionResolution,
    sessionStage,
    activeProvider: effectiveProvider,
    providerStatuses,
    startupNotice,
  };
}

/**
 * Create a startup progress channel that buffers events and replays them to late subscribers.
 * Pass the `onProgress` callback to `runStartup` and the channel to `ScreenController`.
 */
export function createStartupProgressChannel(): {
  channel: StartupProgressChannel;
  onProgress: StartupProgressCallback;
} {
  let listener: StartupProgressCallback | undefined;
  let buffered: ReadonlyArray<StartupStep> = [];

  const onProgress: StartupProgressCallback = (steps) => {
    buffered = steps;
    listener?.(steps);
  };

  const channel: StartupProgressChannel = {
    subscribe: (cb) => {
      listener = cb;
      if (buffered.length > 0) cb(buffered);
    },
  };

  return { channel, onProgress };
}
