import type { ValidationResult } from '../validation/env.js';
import { saveSession, type Session } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { ProviderName } from '../session/session.js';
import type { CommandHandler, CommandResult } from './commands.js';
import { loadSettings, saveSettings, type GlobalSettings } from '../settings/settings.js';

export const OLLAMA_PROVIDER_MESSAGE =
  'Provider: Ollama. To change models, use /model.';

export const CODEX_CLI_PROVIDER_MESSAGE =
  'Provider: Codex CLI. Model selection is managed by Codex — /model is not available for this provider.';

const PROVIDER_SWITCH_USAGE =
  'Use /provider to show the active provider, or /provider <ollama|codex-cli> to switch providers.';

// Kept for backward compatibility
export const PROVIDER_MESSAGE = OLLAMA_PROVIDER_MESSAGE;

export interface ProviderHandlerOptions {
  getSession: () => Session;
  onSessionUpdate: (session: Session) => void;
  checkReadiness?: (provider: ProviderName) => Promise<ValidationResult>;
  onSettingsUpdate?: (settings: GlobalSettings) => void;
}

function formatProviderMessage(
  providerName: ProviderName,
  readiness?: ValidationResult,
  includeUsage = true,
): string {
  const base =
    providerName === 'codex-cli' ? CODEX_CLI_PROVIDER_MESSAGE : OLLAMA_PROVIDER_MESSAGE;
  if (!readiness) {
    return includeUsage ? `${base} ${PROVIDER_SWITCH_USAGE}` : base;
  }
  const availability = readiness.ok
    ? `Availability: ready. ${readiness.message}`
    : `Availability: unavailable. ${readiness.message}`;
  return includeUsage ? `${base} ${availability} ${PROVIDER_SWITCH_USAGE}` : `${base} ${availability}`;
}

export function createProviderHandler(options: ProviderName | ProviderHandlerOptions = 'ollama'): CommandHandler {
  const logger = getLogger();
  const normalized: ProviderHandlerOptions =
    typeof options === 'string'
      ? {
          getSession: () => ({
            id: 'unknown',
            createdAt: '',
            updatedAt: '',
            workingDirectory: '',
            completed: false,
            transcript: [],
            provider: options,
          }),
          onSessionUpdate: () => {},
        }
      : options;
  const includeUsage = typeof options !== 'string';

  return async function handleProvider(args: string[]): Promise<CommandResult> {
    const session = normalized.getSession();
    const currentProvider = session.provider ?? 'ollama';
    logger.info('/provider: command invoked');
    logger.info(`/provider: active provider is ${currentProvider}`);

    const requestedProvider = args[0]?.trim() as ProviderName | undefined;
    if (requestedProvider && requestedProvider !== 'ollama' && requestedProvider !== 'codex-cli') {
      return {
        handled: true,
        continueInterview: true,
        message: `Unknown provider "${args[0]}". ${PROVIDER_SWITCH_USAGE}`,
      };
    }

    if (!requestedProvider || requestedProvider === currentProvider) {
      const readiness = normalized.checkReadiness
        ? await normalized.checkReadiness(currentProvider)
        : undefined;
      return {
        handled: true,
        continueInterview: true,
        message: formatProviderMessage(currentProvider, readiness, includeUsage),
      };
    }

    const updatedSession: Session = {
      ...session,
      provider: requestedProvider,
      model: requestedProvider === 'codex-cli' ? undefined : session.model,
      updatedAt: new Date().toISOString(),
    };
    saveSession(updatedSession);
    normalized.onSessionUpdate(updatedSession);
    logger.info(`/provider: switched active provider to ${requestedProvider}`);
    try {
      const updatedSettings = { ...loadSettings(), defaultProvider: requestedProvider };
      saveSettings(updatedSettings);
      normalized.onSettingsUpdate?.(updatedSettings);
      logger.info(`/provider: saved defaultProvider=${requestedProvider} to global settings`);
    } catch (err) {
      logger.warn(`/provider: failed to save global settings: ${String(err)}`);
    }

    const readiness = normalized.checkReadiness
      ? await normalized.checkReadiness(requestedProvider)
      : undefined;

    return {
      handled: true,
      continueInterview: true,
      message: `Switched provider to ${requestedProvider}. ${formatProviderMessage(requestedProvider, readiness, includeUsage)}`,
    };
  };
}
