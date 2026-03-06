import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createProviderHandler, PROVIDER_MESSAGE } from '../provider-command.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createProviderHandler', () => {
  it('returns handled=true', async () => {
    const handler = createProviderHandler();
    const result = await handler([]);
    expect(result.handled).toBe(true);
  });

  it('returns continueInterview=true', async () => {
    const handler = createProviderHandler();
    const result = await handler([]);
    expect(result.continueInterview).toBe(true);
  });

  it('returns informational message about Ollama support', async () => {
    const handler = createProviderHandler();
    const result = await handler([]);
    expect(result.message).toBe(PROVIDER_MESSAGE);
  });

  it('message mentions Ollama', async () => {
    const handler = createProviderHandler();
    const result = await handler([]);
    expect(result.message).toContain('Ollama');
  });

  it('ignores any args passed', async () => {
    const handler = createProviderHandler();
    const result = await handler(['some', 'args']);
    expect(result.handled).toBe(true);
    expect(result.continueInterview).toBe(true);
  });
});
