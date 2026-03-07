import type { ProviderName } from '../session/session.js';

export type { ProviderName };

export interface RuntimeConfig {
  newSession: boolean;
  version: string;
  verbose: boolean;
  provider: ProviderName;
}

export function createConfig(opts: Partial<RuntimeConfig> & { version: string }): RuntimeConfig {
  return {
    newSession: opts.newSession ?? false,
    version: opts.version,
    verbose: opts.verbose ?? false,
    provider: opts.provider ?? 'ollama',
  };
}
