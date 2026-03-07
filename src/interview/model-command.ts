import { Session, saveSession } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { CommandHandler, CommandResult } from './commands.js';

export interface ModelLister {
  listModels(): Promise<string[]>;
}

export interface ModelHandlerOptions {
  getSession: () => Session;
  onSessionUpdate: (session: Session) => void;
  modelLister: ModelLister;
  onSelectModel: (models: string[]) => Promise<string | null>;
}

export function createModelHandler(options: ModelHandlerOptions): CommandHandler {
  const { getSession, onSessionUpdate, modelLister, onSelectModel } = options;
  const logger = getLogger();

  return async function handleModel(_args: string[]): Promise<CommandResult> {
    logger.info('/model: listing installed models');

    const models = await modelLister.listModels();

    if (models.length === 0) {
      logger.info('/model: no models available');
      return { handled: true, continueInterview: true, message: 'No models available.' };
    }

    logger.info(`/model: found ${models.length} model(s)`);

    const selected = await onSelectModel(models);

    if (!selected) {
      logger.info('/model: no model selected, continuing with current model');
      return { handled: true, continueInterview: true };
    }

    logger.info(`/model: user selected model "${selected}"`);

    const session = getSession();
    const updatedSession: Session = {
      ...session,
      model: selected,
      updatedAt: new Date().toISOString(),
    };
    saveSession(updatedSession);
    onSessionUpdate(updatedSession);

    logger.info(`/model: persisted model "${selected}" in session ${updatedSession.id}`);

    return { handled: true, continueInterview: true };
  };
}
