import type { ProviderName } from '../session/session.js';

export type { ProviderName };

export interface RuntimeConfig {
  newSession: boolean;
  version: string;
  verbose: boolean;
  provider: ProviderName;
  /** True when --provider was explicitly passed on the CLI; false when using a default or global setting. */
  providerExplicit: boolean;
}

export function createConfig(opts: Partial<RuntimeConfig> & { version: string }): RuntimeConfig {
  return {
    newSession: opts.newSession ?? false,
    version: opts.version,
    verbose: opts.verbose ?? false,
    provider: opts.provider ?? 'ollama',
    providerExplicit: opts.providerExplicit ?? false,
  };
}
