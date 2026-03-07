import { spawnSync } from 'node:child_process';
import type { ProviderName } from '../session/session.js';

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export function checkTTY(): ValidationResult {
  if (process.stdin.isTTY !== true) {
    return {
      ok: false,
      message: 'cobuild requires an interactive terminal. Please run it directly in a terminal, not via pipes or scripts.',
    };
  }
  return { ok: true, message: 'terminal is interactive' };
}

export async function checkOllama(baseUrl = 'http://localhost:11434'): Promise<ValidationResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) {
      return { ok: true, message: `Ollama is reachable at ${baseUrl}` };
    }
    return {
      ok: false,
      message: `Ollama returned HTTP ${response.status} at ${baseUrl}. Is Ollama running?`,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const detail = isTimeout
      ? 'connection timed out after 5s'
      : err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Ollama is not reachable at ${baseUrl} (${detail}). Start Ollama and try again.`,
    };
  }
}

export function checkCodexCli(): ValidationResult {
  const result = spawnSync('codex', ['--version'], { timeout: 5000 });
  if (result.error) {
    const errCode = (result.error as NodeJS.ErrnoException).code;
    const isNotFound = errCode === 'ENOENT';
    const isTimeout = errCode === 'ETIMEDOUT';
    const detail = isNotFound
      ? 'codex binary not found on PATH'
      : isTimeout
        ? 'codex --version timed out after 5s'
        : result.error.message;
    const hint = isNotFound ? ' Install Codex CLI and ensure it is on your PATH.' : '';
    return {
      ok: false,
      message: `codex CLI is not available (${detail}).${hint}`,
    };
  }
  if (result.signal) {
    return {
      ok: false,
      message: `codex CLI is not available (killed by signal ${result.signal}). Check your Codex CLI installation.`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: `codex CLI is not available (exited with code ${result.status}). Check your Codex CLI installation.`,
    };
  }
  return { ok: true, message: 'codex CLI is available' };
}

export async function checkProviderReadiness(provider: ProviderName): Promise<ValidationResult> {
  if (provider === 'codex-cli') {
    return checkCodexCli();
  }
  return checkOllama();
}
