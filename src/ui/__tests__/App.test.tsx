import { describe, it } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { App } from '../App.js';

describe('App component', () => {
  it('renders without throwing given valid props', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(App, { sessionId: 'test-session', version: '0.1.0' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing with minimal sessionId', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(App, { sessionId: 'x', version: '1.0.0' }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });
});
