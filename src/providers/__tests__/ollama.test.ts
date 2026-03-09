import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider, resolveOllamaModel } from '../ollama.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listModels', () => {
    it('returns model names from /api/tags', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ models: [{ name: 'llama3', model: 'llama3' }, { name: 'mistral', model: 'mistral' }] }),
      );

      const provider = new OllamaProvider({ model: 'llama3' });
      const models = await provider.listModels();

      expect(models).toEqual(['llama3', 'mistral']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('returns empty array when models list is empty', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ models: [] }));

      const provider = new OllamaProvider({ model: 'llama3' });
      const models = await provider.listModels();

      expect(models).toEqual([]);
    });

    it('uses custom baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ models: [{ name: 'phi3', model: 'phi3' }] }));

      const provider = new OllamaProvider({ model: 'phi3', baseUrl: 'http://custom:11434' });
      const models = await provider.listModels();

      expect(models).toEqual(['phi3']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom:11434/api/tags',
        expect.anything(),
      );
    });

    it('throws on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

      const provider = new OllamaProvider({ model: 'llama3' });
      await expect(provider.listModels()).rejects.toThrow('HTTP 500');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const provider = new OllamaProvider({ model: 'llama3' });
      await expect(provider.listModels()).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('generate', () => {
    it('returns content from /api/chat response', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ message: { role: 'assistant', content: 'What is your project about?' }, done: true }),
      );

      const provider = new OllamaProvider({ model: 'llama3' });
      const result = await provider.generate([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(result).toBe('What is your project about?');
    });

    it('sends correct request body', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ message: { role: 'assistant', content: 'Hi' }, done: true }),
      );

      const provider = new OllamaProvider({ model: 'mistral', baseUrl: 'http://localhost:11434' });
      const messages = [
        { role: 'system' as const, content: 'System prompt' },
        { role: 'user' as const, content: 'User input' },
      ];
      await provider.generate(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'mistral',
            messages: [
              { role: 'system', content: 'System prompt' },
              { role: 'user', content: 'User input' },
            ],
            stream: false,
          }),
        }),
      );
    });

    it('returns empty string when response has no content', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ message: { role: 'assistant', content: '' }, done: true }),
      );

      const provider = new OllamaProvider({ model: 'llama3' });
      const result = await provider.generate([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });

    it('throws on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 503));

      const provider = new OllamaProvider({ model: 'llama3' });
      await expect(
        provider.generate([{ role: 'user', content: 'Hi' }]),
      ).rejects.toThrow('HTTP 503');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));

      const provider = new OllamaProvider({ model: 'llama3' });
      await expect(
        provider.generate([{ role: 'user', content: 'Hi' }]),
      ).rejects.toThrow('connection refused');
    });

    it('throws on JSON parse error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error('invalid json'); },
      } as unknown as Response);

      const provider = new OllamaProvider({ model: 'llama3' });
      await expect(
        provider.generate([{ role: 'user', content: 'Hi' }]),
      ).rejects.toThrow('invalid json');
    });
  });
});

describe('resolveOllamaModel', () => {
  it('returns current model when it is in the installed list', async () => {
    const listModels = vi.fn(async () => ['llama3', 'mistral']);
    const result = await resolveOllamaModel('llama3', listModels);
    expect(result).toEqual({ resolvedModel: 'llama3', noModelsInstalled: false });
  });

  it('returns first model when current model is undefined', async () => {
    const listModels = vi.fn(async () => ['mistral', 'llama3']);
    const result = await resolveOllamaModel(undefined, listModels);
    expect(result.resolvedModel).toBe('mistral');
    expect(result.noModelsInstalled).toBe(false);
    expect(result.notice).toBeUndefined();
  });

  it('returns first model and notice when saved model is missing from installed list', async () => {
    const listModels = vi.fn(async () => ['mistral', 'phi3']);
    const result = await resolveOllamaModel('llama3', listModels);
    expect(result.resolvedModel).toBe('mistral');
    expect(result.noModelsInstalled).toBe(false);
    expect(result.notice).toContain('llama3');
    expect(result.notice).toContain('mistral');
  });

  it('returns noModelsInstalled=true and guidance notice when model list is empty', async () => {
    const listModels = vi.fn(async () => [] as string[]);
    const result = await resolveOllamaModel(undefined, listModels);
    expect(result.noModelsInstalled).toBe(true);
    expect(result.resolvedModel).toBeUndefined();
    expect(result.notice).toContain('ollama pull');
  });

  it('returns noModelsInstalled=true even when session had a saved model', async () => {
    const listModels = vi.fn(async () => [] as string[]);
    const result = await resolveOllamaModel('llama3', listModels);
    expect(result.noModelsInstalled).toBe(true);
    expect(result.notice).toContain('ollama pull');
  });

  it('returns current model unchanged when listing fails (non-fatal)', async () => {
    const listModels = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const result = await resolveOllamaModel('llama3', listModels);
    expect(result.resolvedModel).toBe('llama3');
    expect(result.noModelsInstalled).toBe(false);
    expect(result.notice).toBeUndefined();
  });

  it('returns undefined model unchanged when listing fails with no prior model', async () => {
    const listModels = vi.fn(async () => { throw new Error('timeout'); });
    const result = await resolveOllamaModel(undefined, listModels);
    expect(result.resolvedModel).toBeUndefined();
    expect(result.noModelsInstalled).toBe(false);
  });

  it('does not include notice when auto-selecting first model with no prior model set', async () => {
    const listModels = vi.fn(async () => ['codellama']);
    const result = await resolveOllamaModel(undefined, listModels);
    expect(result.resolvedModel).toBe('codellama');
    expect(result.notice).toBeUndefined();
  });
});
