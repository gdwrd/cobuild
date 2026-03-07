import { Session, appendInterviewMessage, getTranscript, completeInterview } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { isSlashCommand, parseCommand, createCommandRouter } from './commands.js';
import type { CommandHandler, SlashCommand } from './commands.js';
import { MAX_PROMPT_TOKENS } from './prompts.js';

export const COMPLETION_MARKER = '[INTERVIEW_COMPLETE]';

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
  logger.info(`prompt orchestration: ${messages.length} messages, ~${estimatedTokens} estimated tokens`);
  if (estimatedTokens > MAX_PROMPT_TOKENS) {
    logger.warn(`prompt orchestration: prompt may be too large (~${estimatedTokens} tokens > ${MAX_PROMPT_TOKENS})`);
  }

  logger.info(`interview turn: sending ${messages.length} messages to model`);

  const rawResponse = await provider.generate(messages);
  const complete = detectCompletion(rawResponse);
  const response = stripCompletionMarker(rawResponse);

  logger.info(`interview turn: received response (complete=${complete})`);

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
    logger.info('interview loop: starting with initial model prompt');
    const result = await runInterviewTurn(currentSession, provider, systemPrompt);
    currentSession = result.session;
    await onAssistantResponse(result.response, result.complete);

    if (result.complete) {
      logger.info('interview loop: completed after initial turn');
      currentSession = completeInterview(currentSession, false);
      return currentSession;
    }
  } else {
    const tx = getTranscript(currentSession);
    if (tx[tx.length - 1].role === 'user') {
      logger.info('interview loop: resuming after incomplete turn, generating model response');
      const result = await runInterviewTurn(currentSession, provider, systemPrompt);
      currentSession = result.session;
      await onAssistantResponse(result.response, result.complete);

      if (result.complete) {
        logger.info('interview loop: completed after resumed turn');
        currentSession = completeInterview(currentSession, false);
        return currentSession;
      }
    }
  }

  let complete = false;
  while (!complete) {
    const userInput = await onUserInput();
    logger.info('interview loop: received user input');

    if (isSlashCommand(userInput)) {
      const parsed = parseCommand(userInput);
      if (parsed) {
        const cmdResult = await routeCommand(parsed);
        if (cmdResult.message) {
          await onAssistantResponse(cmdResult.message, false);
        }
        if (!cmdResult.continueInterview) {
          logger.info('interview loop: command stopped interview');
          complete = true;
        }
        continue;
      }
      logger.info(`interview loop: unrecognized slash command "${userInput.trim()}", ignoring`);
      continue;
    }

    currentSession = appendInterviewMessage(currentSession, 'user', userInput);

    const result = await runInterviewTurn(currentSession, provider, systemPrompt);
    currentSession = result.session;
    await onAssistantResponse(result.response, result.complete);
    complete = result.complete;

    if (complete) {
      logger.info('interview loop: completed');
      currentSession = completeInterview(currentSession, false);
    }
  }

  return currentSession;
}
