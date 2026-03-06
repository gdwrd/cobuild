import { describe, it, expect } from 'vitest';
import { createConfig } from '../config.js';

describe('createConfig', () => {
  it('returns defaults when only version is provided', () => {
    const config = createConfig({ version: '1.0.0' });
    expect(config.version).toBe('1.0.0');
    expect(config.newSession).toBe(false);
    expect(config.verbose).toBe(false);
  });

  it('respects newSession=true', () => {
    const config = createConfig({ version: '1.0.0', newSession: true });
    expect(config.newSession).toBe(true);
  });

  it('respects verbose=true', () => {
    const config = createConfig({ version: '1.0.0', verbose: true });
    expect(config.verbose).toBe(true);
  });
});
