import { Session, appendInterviewMessage, getTranscript, completeInterview } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { isSlashCommand, parseCommand, createCommandRouter, buildUnknownCommandMessage } from './commands.js';
import type { CommandHandler, SlashCommand } from './commands.js';
import { MAX_PROMPT_TOKENS, isPromptTooLarge } from './prompts.js';

export const COMPLETION_MARKER = '[INTERVIEW_COMPLETE]';

export const PROMPT_TOO_LARGE_MESSAGE =
  'The interview transcript has grown too large to process. Please type /finish-now to generate your spec with the information already provided.';

export class PromptTooLargeError extends Error {
  constructor() {
    super('Prompt too large');
    this.name = 'PromptTooLargeError';
  }
}

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelProvider {
  generate(messages: ModelMessage[]): Promise<string>;
}

export interface InterviewTurnResult {
  session: Session;
  response: string;
  complete: boolean;
}

export function buildModelMessages(systemPrompt: string, session: Session): ModelMessage[] {
  const messages: ModelMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const msg of getTranscript(session)) {
    messages.push({ role: msg.role, content: msg.content });
  }
  return messages;
}

export function detectCompletion(response: string): boolean {
  return response.includes(COMPLETION_MARKER);
}

export function stripCompletionMarker(response: string): string {
  return response.replaceAll(COMPLETION_MARKER, '').trim();
}

export async function runInterviewTurn(
  session: Session,
  provider: ModelProvider,
  systemPrompt: string,
): Promise<InterviewTurnResult> {
  const logger = getLogger();
  const messages = buildModelMessages(systemPrompt, session);

  const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
  logger.info(`prompt orchestration: ${messages.length} messages, ~${estimatedTokens} estimated tokens (session ${session.id})`);

  if (isPromptTooLarge(messages)) {
    logger.error(
      `prompt size: transcript too large (~${estimatedTokens} tokens > ${MAX_PROMPT_TOKENS}), aborting generation (session ${session.id})`,
    );
    throw new PromptTooLargeError();
  }

  logger.info(`interview turn: sending ${messages.length} messages to model (session ${session.id})`);

  const rawResponse = await provider.generate(messages);
  const complete = detectCompletion(rawResponse);
  const response = stripCompletionMarker(rawResponse);

  logger.info(`interview turn: received response (complete=${complete}, session ${session.id})`);

  const updatedSession = appendInterviewMessage(session, 'assistant', response);

  return { session: updatedSession, response, complete };
}

export async function runInterviewLoop(
  session: Session,
  provider: ModelProvider,
  systemPrompt: string,
  onUserInput: () => Promise<string>,
  onAssistantResponse: (response: string, complete: boolean) => Promise<void>,
  commandHandlers?: Partial<Record<SlashCommand, CommandHandler>>,
): Promise<Session> {
  const logger = getLogger();
  const routeCommand = createCommandRouter(commandHandlers ?? {});
  let currentSession = session;

  if (getTranscript(currentSession).length === 0) {
    logger.info(`interview loop: starting with initial model prompt (session ${session.id})`);
    try {
      const result = await runInterviewTurn(currentSession, provider, systemPrompt);
      currentSession = result.session;
      await onAssistantResponse(result.response, result.complete);

      if (result.complete) {
        logger.info(`interview loop: completed after initial turn (session ${session.id})`);
        currentSession = completeInterview(currentSession, false);
        return currentSession;
      }
    } catch (err) {
      if (err instanceof PromptTooLargeError) {
        logger.error(`interview loop: prompt too large on initial turn, instructing user to finish (session ${session.id})`);
        await onAssistantResponse(PROMPT_TOO_LARGE_MESSAGE, false);
        // fall through to the while loop so the user can type /finish-now
      } else {
        throw err;
      }
    }
  } else {
    const tx = getTranscript(currentSession);
    if (tx[tx.length - 1].role === 'user') {
      logger.info(`interview loop: resuming after incomplete turn, generating model response (session ${session.id})`);
      try {
        const result = await runInterviewTurn(currentSession, provider, systemPrompt);
        currentSession = result.session;
        await onAssistantResponse(result.response, result.complete);

        if (result.complete) {
          logger.info(`interview loop: completed after resumed turn (session ${session.id})`);
          currentSession = completeInterview(currentSession, false);
          return currentSession;
        }
      } catch (err) {
        if (err instanceof PromptTooLargeError) {
          logger.error(`interview loop: prompt too large on resume, instructing user to finish (session ${session.id})`);
          await onAssistantResponse(PROMPT_TOO_LARGE_MESSAGE, false);
          // fall through to the while loop so the user can type /finish-now
        } else {
          throw err;
        }
      }
    }
  }

  let complete = false;
  while (!complete) {
    const userInput = await onUserInput();
    logger.info(`interview loop: received user input (session ${session.id})`);

    if (isSlashCommand(userInput)) {
      const parsed = parseCommand(userInput);
      if (parsed) {
        let cmdResult;
        try {
          cmdResult = await routeCommand(parsed);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          logger.error(`interview loop: command "${parsed.command}" threw an error (session ${session.id}): ${detail}`);
          await onAssistantResponse(
            `Command failed: ${detail}. Please try again or type /finish-now to end the interview.`,
            false,
          );
          continue;
        }
        if (cmdResult.message) {
          await onAssistantResponse(cmdResult.message, false);
        }
        if (!cmdResult.continueInterview) {
          logger.info(`interview loop: command stopped interview (session ${session.id})`);
          complete = true;
        }
        continue;
      }
      logger.info(`interview loop: unrecognized slash command "${userInput.trim()}", sending help (session ${session.id})`);
      await onAssistantResponse(buildUnknownCommandMessage(userInput.trim()), false);
      continue;
    }

    currentSession = appendInterviewMessage(currentSession, 'user', userInput);

    let result: InterviewTurnResult;
    try {
      result = await runInterviewTurn(currentSession, provider, systemPrompt);
    } catch (err) {
      if (err instanceof PromptTooLargeError) {
        logger.error(`interview loop: prompt too large, instructing user to finish (session ${session.id})`);
        await onAssistantResponse(PROMPT_TOO_LARGE_MESSAGE, false);
        continue;
      }
      throw err;
    }

    currentSession = result.session;
    await onAssistantResponse(result.response, result.complete);
    complete = result.complete;

    if (complete) {
      logger.info(`interview loop: completed (session ${session.id})`);
      currentSession = completeInterview(currentSession, false);
    }
  }

  return currentSession;
}
