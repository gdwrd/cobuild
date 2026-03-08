import { getLogger } from '../logging/logger.js';

export type SlashCommand = '/finish-now' | '/model' | '/provider' | '/help';

export const KNOWN_COMMANDS: SlashCommand[] = ['/finish-now', '/model', '/provider', '/help'];

export const HELP_MESSAGE = [
  'Available commands:',
  '  /finish-now   — end the interview now and generate your spec',
  '  /model        — list available models or switch to a named model (/model <name>)',
  '  /provider     — switch provider (/provider ollama | codex-cli)',
  '  /help         — show this command reference',
].join('\n');

export function buildUnknownCommandMessage(input: string): string {
  return `Unknown command: ${input}\n\n${HELP_MESSAGE}`;
}

export interface ParsedCommand {
  command: SlashCommand;
  args: string[];
}

export interface CommandResult {
  handled: boolean;
  continueInterview: boolean;
  message?: string;
}

export type CommandHandler = (args: string[]) => Promise<CommandResult>;

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  if (!KNOWN_COMMANDS.includes(command as SlashCommand)) {
    return null;
  }

  return { command: command as SlashCommand, args };
}

export function createCommandRouter(
  handlers: Partial<Record<SlashCommand, CommandHandler>>,
): (command: ParsedCommand) => Promise<CommandResult> {
  const logger = getLogger();

  return async function routeCommand(command: ParsedCommand): Promise<CommandResult> {
    const handler = handlers[command.command];

    if (!handler) {
      logger.info(`slash command: no handler registered for ${command.command}`);
      return { handled: false, continueInterview: true };
    }

    logger.info(`slash command: routing ${command.command} (args=${command.args.join(' ')})`);
    const result = await handler(command.args);
    logger.info(
      `slash command: ${command.command} handled, continueInterview=${result.continueInterview}`,
    );

    return result;
  };
}
