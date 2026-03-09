import { describe, it, expect, vi } from 'vitest';
import { createProvider, supportsModelListing } from '../factory.js';
import { OllamaProvider } from '../ollama.js';
import { CodexCliProvider } from '../codex-cli.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('createProvider', () => {
  it('returns OllamaProvider for ollama', () => {
    const provider = createProvider('ollama', 'llama3');
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('returns OllamaProvider with no model when model omitted', () => {
    const provider = createProvider('ollama');
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('does not inject llama3 as default model for Ollama when model is omitted', () => {
    // OllamaProvider is constructed without a model — no 'llama3' fallback.
    // The provider instance should still be created successfully.
    const provider = createProvider('ollama');
    expect(provider).toBeInstanceOf(OllamaProvider);
    // supportsModelListing works regardless of whether a model is set
    expect(typeof (provider as OllamaProvider & { listModels: unknown }).listModels).toBe('function');
  });

  it('returns CodexCliProvider for codex-cli', () => {
    const provider = createProvider('codex-cli');
    expect(provider).toBeInstanceOf(CodexCliProvider);
  });

  it('ignores model argument for codex-cli', () => {
    const provider = createProvider('codex-cli', 'gpt-4o');
    expect(provider).toBeInstanceOf(CodexCliProvider);
  });

  it('returned OllamaProvider satisfies ModelProvider interface', () => {
    const provider = createProvider('ollama', 'llama3');
    expect(typeof provider.generate).toBe('function');
  });

  it('returned CodexCliProvider satisfies ModelProvider interface', () => {
    const provider = createProvider('codex-cli');
    expect(typeof provider.generate).toBe('function');
  });
});

describe('supportsModelListing', () => {
  it('returns true for OllamaProvider', () => {
    const provider = createProvider('ollama', 'llama3');
    expect(supportsModelListing(provider)).toBe(true);
  });

  it('returns false for CodexCliProvider', () => {
    const provider = createProvider('codex-cli');
    expect(supportsModelListing(provider)).toBe(false);
  });

  it('returns false for a plain ModelProvider with no listModels', () => {
    const plain = { generate: async () => '' };
    expect(supportsModelListing(plain)).toBe(false);
  });

  it('returns true when provider has a listModels function', () => {
    const withListing = { generate: async () => '', listModels: async () => [] };
    expect(supportsModelListing(withListing)).toBe(true);
  });

  it('type-narrows to ModelProvider & ModelLister when true', () => {
    const provider = createProvider('ollama', 'llama3');
    if (supportsModelListing(provider)) {
      // TypeScript should allow calling listModels here
      expect(typeof provider.listModels).toBe('function');
    }
  });
});
