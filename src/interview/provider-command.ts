import { getLogger } from '../logging/logger.js';
import type { ProviderName } from '../session/session.js';
import type { CommandHandler, CommandResult } from './commands.js';

export const OLLAMA_PROVIDER_MESSAGE =
  'Provider: Ollama. To change models, use /model.';

export const CODEX_CLI_PROVIDER_MESSAGE =
  'Provider: Codex CLI. Model selection is managed by Codex — /model is not available for this provider.';

// Kept for backward compatibility
export const PROVIDER_MESSAGE = OLLAMA_PROVIDER_MESSAGE;

export function createProviderHandler(providerName: ProviderName = 'ollama'): CommandHandler {
  const logger = getLogger();

  return async function handleProvider(_args: string[]): Promise<CommandResult> {
    logger.info('/provider: command invoked');
    logger.info(`/provider: active provider is ${providerName}`);

    const message =
      providerName === 'codex-cli' ? CODEX_CLI_PROVIDER_MESSAGE : OLLAMA_PROVIDER_MESSAGE;

    return { handled: true, continueInterview: true, message };
  };
}
