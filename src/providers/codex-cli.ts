import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getLogger } from '../logging/logger.js';
import type { ModelMessage, ModelProvider } from '../interview/controller.js';

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
    const tempDir = mkdtempSync(join(tmpdir(), 'cobuild-codex-'));
    const outputPath = join(tempDir, 'last-message.txt');

    logger.info(`codex-cli: generate request, ${messages.length} messages`);
    logger.debug(`codex-cli: prompt length=${prompt.length}`);

    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          'codex',
          ['exec', '-', '--skip-git-repo-check', '--color', 'never', '--output-last-message', outputPath],
          { timeout: CODEX_TIMEOUT_MS, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
          (err, _out, errOut) => {
            if (err) {
              (err as NodeJS.ErrnoException & { stderr?: string }).stderr =
                typeof errOut === 'string' ? errOut.trim() : '';
              reject(err);
            } else {
              resolve();
            }
          },
        );
        child.stdin?.on('error', reject);
        child.stdin?.write(prompt, 'utf8');
        child.stdin?.end();
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        ((err as NodeJS.ErrnoException & { killed?: boolean }).killed === true ||
          (err as NodeJS.ErrnoException).code === 'ETIMEDOUT');
      const stderr =
        err instanceof Error && typeof (err as NodeJS.ErrnoException & { stderr?: string }).stderr === 'string'
          ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr!.trim()
          : '';
      const detail = isTimeout
        ? `timed out after ${CODEX_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      const fullDetail = stderr ? `${detail}; stderr: ${stderr}` : detail;
      logger.error(`codex-cli: generate error: ${fullDetail}`);
      throw new Error(`codex CLI failed: ${fullDetail}`);
    }

    try {
      const content = readFileSync(outputPath, 'utf8').trim();
      if (!content) {
        throw new Error('codex CLI returned empty response');
      }
      logger.info(`codex-cli: response received (length=${content.length})`);
      return content;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
