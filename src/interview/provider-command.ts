import { getLogger } from '../logging/logger.js';
import type { CommandHandler, CommandResult } from './commands.js';

export const PROVIDER_MESSAGE =
  'Provider: Ollama (only supported provider in v1). To change models, use /model.';

export function createProviderHandler(): CommandHandler {
  const logger = getLogger();

  return async function handleProvider(_args: string[]): Promise<CommandResult> {
    logger.info('/provider: command invoked');
    logger.info('/provider: only Ollama is supported in v1');

    return { handled: true, continueInterview: true, message: PROVIDER_MESSAGE };
  };
}
