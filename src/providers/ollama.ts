import { getLogger } from '../logging/logger.js';
import type { ModelMessage, ModelProvider } from '../interview/controller.js';
import type { ModelLister } from '../interview/model-command.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const REQUEST_TIMEOUT_MS = 120_000;

interface OllamaTagsResponse {
  models: Array<{ name: string; model: string }>;
}

interface OllamaChatMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  message: OllamaChatMessage;
  done: boolean;
}

export interface OllamaProviderOptions {
  model: string;
  baseUrl?: string;
}

export class OllamaProvider implements ModelProvider, ModelLister {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OllamaProviderOptions) {
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async listModels(): Promise<string[]> {
    const logger = getLogger();
    const url = `${this.baseUrl}/api/tags`;

    logger.info(`ollama: listing models from ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    let body: OllamaTagsResponse;
    try {
      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`ollama: listModels fetch error: ${detail}`);
        throw new Error(`Failed to reach Ollama at ${this.baseUrl}: ${detail}`);
      }

      if (!response.ok) {
        const msg = `ollama: listModels HTTP ${response.status}`;
        logger.error(msg);
        throw new Error(`Ollama returned HTTP ${response.status} for /api/tags`);
      }

      try {
        body = (await response.json()) as OllamaTagsResponse;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`ollama: listModels JSON parse error: ${detail}`);
        throw new Error(`Failed to parse Ollama /api/tags response: ${detail}`);
      }
    } finally {
      clearTimeout(timer);
    }

    logger.info(`ollama: raw /api/tags response: ${JSON.stringify(body)}`);

    const names = (body.models ?? []).map((m) => m.name);
    logger.info(`ollama: found ${names.length} model(s): ${names.join(', ')}`);
    return names;
  }

  async generate(messages: ModelMessage[]): Promise<string> {
    const logger = getLogger();
    const url = `${this.baseUrl}/api/chat`;

    const requestBody = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    logger.info(
      `ollama: generate request to ${url} model=${this.model} messages=${messages.length}`,
    );
    logger.debug(`ollama: raw request body: ${JSON.stringify(requestBody)}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    let body: OllamaChatResponse;
    try {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`ollama: generate fetch error: ${detail}`);
        throw new Error(`Failed to reach Ollama at ${this.baseUrl}: ${detail}`);
      }

      if (!response.ok) {
        const msg = `ollama: generate HTTP ${response.status}`;
        logger.error(msg);
        throw new Error(`Ollama returned HTTP ${response.status} for /api/chat`);
      }

      try {
        body = (await response.json()) as OllamaChatResponse;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`ollama: generate JSON parse error: ${detail}`);
        throw new Error(`Failed to parse Ollama /api/chat response: ${detail}`);
      }
    } finally {
      clearTimeout(timer);
    }

    logger.debug(`ollama: raw response body: ${JSON.stringify(body)}`);

    const content = body?.message?.content ?? '';
    logger.info(`ollama: generate response received (length=${content.length})`);

    return content;
  }
}
