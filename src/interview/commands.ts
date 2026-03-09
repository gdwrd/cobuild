import { getLogger } from '../logging/logger.js';

export type SlashCommand = '/finish-now' | '/model' | '/provider' | '/help';

/** Structured metadata for a slash command — drives parsing, help output, and autocomplete. */
export interface CommandMetadata {
  name: SlashCommand;
  /** Short usage string shown in autocomplete suggestions and the help reference. */
  usage: string;
  /** One-line description of what the command does. */
  description: string;
}

/** Source-of-truth command definitions. All exports below are derived from this list. */
export const COMMAND_DEFINITIONS: CommandMetadata[] = [
  {
    name: '/finish-now',
    usage: '/finish-now',
    description: 'end the interview now and generate your spec',
  },
  {
    name: '/model',
    usage: '/model [name]',
    description: 'list available models or switch to a named model',
  },
  {
    name: '/provider',
    usage: '/provider ollama|codex-cli',
    description: 'switch provider',
  },
  {
    name: '/help',
    usage: '/help',
    description: 'show this command reference',
  },
];

export const KNOWN_COMMANDS: SlashCommand[] = COMMAND_DEFINITIONS.map(d => d.name);

export const HELP_MESSAGE = [
  'Available commands:',
  ...COMMAND_DEFINITIONS.map(d => `  ${d.name.padEnd(14)} — ${d.description}`),
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

/**
 * Filter COMMAND_DEFINITIONS by a slash-command prefix.
 * Used by the interview input autocomplete to narrow suggestions as the user types.
 * Returns an empty array when prefix is empty or does not start with '/'.
 */
export function filterCommands(prefix: string): CommandMetadata[] {
  if (!prefix.startsWith('/')) return [];
  const lower = prefix.toLowerCase();
  return COMMAND_DEFINITIONS.filter(d => d.name.toLowerCase().startsWith(lower));
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
