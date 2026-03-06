import { describe, it, expect } from 'vitest';
import { runStartup } from '../app-shell.js';

describe('runStartup', () => {
  it('returns success with a message', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
    expect(result.message).toBeTruthy();
  });

  it('returns success with newSession=true', async () => {
    const result = await runStartup({ newSession: true, version: '1.0.0', verbose: false });
    expect(result.success).toBe(true);
  });

  it('returns success with verbose=true', async () => {
    const result = await runStartup({ newSession: false, version: '1.0.0', verbose: true });
    expect(result.success).toBe(true);
  });
});
