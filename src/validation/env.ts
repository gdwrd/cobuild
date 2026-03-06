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
