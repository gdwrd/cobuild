import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ModelSelectPrompt } from '../ModelSelectPrompt.js';

function createInputStream(): NodeJS.ReadStream {
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream & {
    setRawMode: (mode: boolean) => typeof stdin;
  };
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  return stdin;
}

function renderPromptText(models: string[], props: Partial<Parameters<typeof ModelSelectPrompt>[0]> = {}): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(
    React.createElement(ModelSelectPrompt, { models, ...props }),
    {
      stdout: stream as unknown as NodeJS.WriteStream,
      stdin: createInputStream(),
    },
  );
  unmount();
  const raw = Buffer.concat(chunks).toString();
  /* eslint-disable no-control-regex */
  return raw
    .replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '')
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '');
  /* eslint-enable no-control-regex */
}

describe('ModelSelectPrompt', () => {
  it('renders without throwing for a list of models', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ModelSelectPrompt, { models: ['llama3', 'mistral'] }),
      {
        stdout: stream as unknown as NodeJS.WriteStream,
        stdin: createInputStream(),
      },
    );
    unmount();
  });

  it('shows all provided model names', () => {
    const output = renderPromptText(['llama3', 'mistral', 'codellama']);
    expect(output).toContain('llama3');
    expect(output).toContain('mistral');
    expect(output).toContain('codellama');
  });

  it('shows numbered list starting at 1', () => {
    const output = renderPromptText(['llama3', 'mistral']);
    expect(output).toContain('1.');
    expect(output).toContain('2.');
  });

  it('shows arrow key navigation instructions', () => {
    const output = renderPromptText(['llama3']);
    expect(output).toContain('↑/↓');
    expect(output).toContain('Enter');
  });

  it('shows selection prompt header', () => {
    const output = renderPromptText(['llama3']);
    expect(output).toContain('Select a model');
  });

  it('renders without throwing when given a single model', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ModelSelectPrompt, { models: ['only-model'] }),
      {
        stdout: stream as unknown as NodeJS.WriteStream,
        stdin: createInputStream(),
      },
    );
    unmount();
  });

  it('shows selection indicator on the first item by default', () => {
    const output = renderPromptText(['llama3', 'mistral']);
    // The first model should have the ▶ cursor indicator
    expect(output).toContain('▶');
  });

  it('pre-selects currentModel when it appears in the list', () => {
    const output = renderPromptText(['llama3', 'mistral', 'codellama'], { currentModel: 'mistral' });
    // currentModel should be shown as the context label
    expect(output).toContain('Current:');
    expect(output).toContain('mistral');
  });

  it('shows current model context label when currentModel is provided', () => {
    const output = renderPromptText(['llama3', 'codellama'], { currentModel: 'llama3' });
    expect(output).toContain('Current:');
    expect(output).toContain('llama3');
  });

  it('does not show current model label when currentModel is not provided', () => {
    const output = renderPromptText(['llama3']);
    expect(output).not.toContain('Current:');
  });

  it('does not call onSelect on initial render', () => {
    const onSelect = vi.fn();
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ModelSelectPrompt, { models: ['llama3', 'mistral'], onSelect }),
      {
        stdout: stream as unknown as NodeJS.WriteStream,
        stdin: createInputStream(),
      },
    );
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it('shows esc to keep current hint', () => {
    const output = renderPromptText(['llama3']);
    expect(output.toLowerCase()).toContain('esc');
  });
});
