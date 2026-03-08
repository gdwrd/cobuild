import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ModelSelectPrompt } from '../ModelSelectPrompt.js';

function renderPromptText(models: string[]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(ModelSelectPrompt, { models }), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
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
    const { unmount } = render(React.createElement(ModelSelectPrompt, { models: ['llama3', 'mistral'] }), {
      stdout: stream as unknown as NodeJS.WriteStream,
    });
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

  it('shows instructions for selecting by number or name', () => {
    const output = renderPromptText(['llama3']);
    expect(output.toLowerCase()).toContain('number');
  });

  it('shows selection prompt header', () => {
    const output = renderPromptText(['llama3']);
    expect(output).toContain('Select a model');
  });

  it('renders without throwing when given a single model', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ModelSelectPrompt, { models: ['only-model'] }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });
});
