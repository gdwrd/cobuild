import { Session, saveSession } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { CommandHandler, CommandResult } from './commands.js';

export interface ModelLister {
  listModels(): Promise<string[]>;
}

export const MODEL_NOT_SUPPORTED_MESSAGE =
  'Model selection is managed by Codex. To change models, configure Codex directly — this cannot be changed from cobuild.';

export interface ModelHandlerOptions {
  getSession: () => Session;
  onSessionUpdate: (session: Session) => void;
  modelLister?: ModelLister;
  onSelectModel: (models: string[]) => Promise<string | null>;
  supportsModelListing: boolean;
}

export function createModelHandler(options: ModelHandlerOptions): CommandHandler {
  const { getSession, onSessionUpdate, modelLister, onSelectModel, supportsModelListing } = options;
  const logger = getLogger();

  return async function handleModel(_args: string[]): Promise<CommandResult> {
    logger.info('/model: command invoked');

    if (!supportsModelListing) {
      logger.info('/model: model listing not supported for active provider');
      return { handled: true, continueInterview: true, message: MODEL_NOT_SUPPORTED_MESSAGE };
    }

    logger.info('/model: listing installed models');

    if (!modelLister) {
      logger.error('/model: modelLister not provided despite supportsModelListing=true');
      return { handled: true, continueInterview: true, message: 'Model listing is unavailable.' };
    }

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
