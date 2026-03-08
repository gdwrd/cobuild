import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ErrorScreen } from '../ErrorScreen.js';

function renderToString(props: Parameters<typeof ErrorScreen>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(ErrorScreen, props), {
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

describe('ErrorScreen', () => {
  it('renders the message in the output', () => {
    const output = renderToString({ message: 'Something went wrong' });
    expect(output).toContain('Something went wrong');
  });

  it('renders the "Error:" prefix', () => {
    const output = renderToString({ message: 'Something went wrong' });
    expect(output).toContain('Error:');
  });

  it('renders without throwing with an empty message', () => {
    const output = renderToString({ message: '' });
    expect(output).toContain('Error:');
  });

  it('renders a long error message in the output', () => {
    const msg = "EACCES: permission denied, open '/home/user/.cobuild/sessions/abc-123.json'";
    const output = renderToString({ message: msg });
    expect(output).toContain('EACCES');
  });
});
