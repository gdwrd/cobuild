import { Session, appendInterviewMessage, completeInterview } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { buildModelMessages, stripCompletionMarker } from './controller.js';
import type { CommandHandler, CommandResult } from './commands.js';
import type { ModelProvider, ModelMessage } from './controller.js';

export const FINISH_NOW_PROMPT =
  `The user has requested to end the interview early. Based on the information gathered so far, ` +
  `please infer any missing details you would need for the specification. ` +
  `Provide a brief acknowledgment that you have enough information to proceed with generating the spec. ` +
  `You MUST include [INTERVIEW_COMPLETE] at the end of your response.`;

export function buildFinishNowMessages(session: Session, systemPrompt: string): ModelMessage[] {
  const messages = buildModelMessages(systemPrompt, session);
  messages.push({ role: 'user', content: FINISH_NOW_PROMPT });
  return messages;
}

export interface FinishNowHandlerOptions {
  getSession: () => Session;
  onSessionUpdate: (session: Session) => void;
  provider: ModelProvider;
  systemPrompt: string;
  onResponse: (response: string) => Promise<void>;
}

export function createFinishNowHandler(options: FinishNowHandlerOptions): CommandHandler {
  const { getSession, onSessionUpdate, provider, systemPrompt, onResponse } = options;
  const logger = getLogger();

  return async function handleFinishNow(_args: string[]): Promise<CommandResult> {
    logger.info('/finish-now: building final prompt');

    const session = getSession();
    const messages = buildFinishNowMessages(session, systemPrompt);

    logger.info(`/finish-now: sending final prompt to model (${messages.length} messages)`);
    const rawResponse = await provider.generate(messages);
    const response = stripCompletionMarker(rawResponse);

    logger.info('/finish-now: received final model response, marking interview complete');

    let updatedSession = appendInterviewMessage(session, 'assistant', response);
    updatedSession = completeInterview(updatedSession, true);

    logger.info(`/finish-now: session ${updatedSession.id} persisted as completed`);

    onSessionUpdate(updatedSession);
    await onResponse(response);

    return { handled: true, continueInterview: false };
  };
}
