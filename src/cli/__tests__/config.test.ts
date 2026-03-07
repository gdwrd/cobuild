import { describe, it, expect } from 'vitest';
import { createConfig } from '../config.js';

describe('createConfig', () => {
  it('returns defaults when only version is provided', () => {
    const config = createConfig({ version: '1.0.0' });
    expect(config.version).toBe('1.0.0');
    expect(config.newSession).toBe(false);
    expect(config.verbose).toBe(false);
    expect(config.provider).toBe('ollama');
  });

  it('respects newSession=true', () => {
    const config = createConfig({ version: '1.0.0', newSession: true });
    expect(config.newSession).toBe(true);
  });

  it('respects verbose=true', () => {
    const config = createConfig({ version: '1.0.0', verbose: true });
    expect(config.verbose).toBe(true);
  });

  it('defaults provider to ollama when not specified', () => {
    const config = createConfig({ version: '1.0.0' });
    expect(config.provider).toBe('ollama');
  });

  it('respects provider=codex-cli', () => {
    const config = createConfig({ version: '1.0.0', provider: 'codex-cli' });
    expect(config.provider).toBe('codex-cli');
  });

  it('respects provider=ollama explicitly', () => {
    const config = createConfig({ version: '1.0.0', provider: 'ollama' });
    expect(config.provider).toBe('ollama');
  });
});
