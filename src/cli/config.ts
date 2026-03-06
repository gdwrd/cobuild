export interface RuntimeConfig {
  newSession: boolean;
  version: string;
  verbose: boolean;
}

export function createConfig(opts: Partial<RuntimeConfig> & { version: string }): RuntimeConfig {
  return {
    newSession: opts.newSession ?? false,
    version: opts.version,
    verbose: opts.verbose ?? false,
  };
}
