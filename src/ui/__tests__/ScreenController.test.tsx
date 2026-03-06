import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { ScreenController } from '../ScreenController.js';
import type { StartupResult } from '../../cli/app-shell.js';

vi.mock('../App.js', () => ({
  App: function MockApp() {
    return null;
  },
}));

describe('ScreenController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without throwing given a pending promise', () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: new Promise<StartupResult>(() => {}),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders without throwing when startup succeeds', async () => {
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: true, message: 'ok', sessionId: 'abc-123' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    unmount();
  });

  it('calls process.exit(1) after startup failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stream = new PassThrough();
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: Promise.resolve({ success: false, message: 'Ollama unreachable' }),
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(exitSpy).toHaveBeenCalledWith(1);
    unmount();
  });

  it('calls process.exit(1) when startup promise rejects', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stream = new PassThrough();
    const rejected = Promise.reject<StartupResult>(new Error('unexpected crash'));
    rejected.catch(() => {});
    const { unmount } = render(
      React.createElement(ScreenController, {
        startupPromise: rejected,
        version: '0.1.0',
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(exitSpy).toHaveBeenCalledWith(1);
    unmount();
  });
});
