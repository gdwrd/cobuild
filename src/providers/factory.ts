import type { ProviderName } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import type { ModelLister } from '../interview/model-command.js';
import { OllamaProvider } from './ollama.js';
import { CodexCliProvider } from './codex-cli.js';

export function createProvider(providerName: ProviderName, model?: string): ModelProvider {
  if (providerName === 'codex-cli') {
    return new CodexCliProvider();
  }
  return new OllamaProvider({ model });
}

export function supportsModelListing(
  provider: ModelProvider,
): provider is ModelProvider & ModelLister {
  return (
    'listModels' in provider &&
    typeof (provider as Record<string, unknown>)['listModels'] === 'function'
  );
}
