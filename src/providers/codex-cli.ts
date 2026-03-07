import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getLogger } from '../logging/logger.js';
import type { ModelMessage, ModelProvider } from '../interview/controller.js';

const execFileAsync = promisify(execFile);

const CODEX_TIMEOUT_MS = 120_000;

export function buildCodexPrompt(messages: ModelMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === 'system') return `System: ${m.content}`;
      if (m.role === 'user') return `User: ${m.content}`;
      return `Assistant: ${m.content}`;
    })
    .join('\n\n');
}

export class CodexCliProvider implements ModelProvider {
  async generate(messages: ModelMessage[]): Promise<string> {
    const logger = getLogger();
    const prompt = buildCodexPrompt(messages);

    logger.info(`codex-cli: generate request, ${messages.length} messages`);
    logger.debug(`codex-cli: prompt length=${prompt.length}`);

    let stdout: string;
    try {
      const result = await execFileAsync('codex', ['--quiet', '--', prompt], {
        timeout: CODEX_TIMEOUT_MS,
        encoding: 'utf8',
      });
      stdout = result.stdout;
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        ((err as NodeJS.ErrnoException & { killed?: boolean }).killed === true ||
          (err as NodeJS.ErrnoException).code === 'ETIMEDOUT');
      const detail = isTimeout
        ? `timed out after ${CODEX_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      logger.error(`codex-cli: generate error: ${detail}`);
      throw new Error(`codex CLI failed: ${detail}`);
    }

    const content = stdout.trim();
    logger.info(`codex-cli: response received (length=${content.length})`);
    return content;
  }
}
