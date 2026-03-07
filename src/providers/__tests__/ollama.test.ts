import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../ollama.js';

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
