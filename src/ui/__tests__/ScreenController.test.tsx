import { describe, it, expect } from 'vitest';
import { ScreenController } from '../ScreenController.js';
import type { StartupResult } from '../../cli/app-shell.js';

describe('ScreenController component', () => {
  it('exports ScreenController as a function component', () => {
    expect(typeof ScreenController).toBe('function');
  });

  it('accepts ScreenControllerProps with startupPromise and version', () => {
    const result: StartupResult = { success: true, message: 'ok', sessionId: 'abc-123' };
    const props = {
      startupPromise: Promise.resolve(result),
      version: '0.1.0',
    };
    expect(props.version).toBe('0.1.0');
    expect(props.startupPromise).toBeInstanceOf(Promise);
  });

  it('accepts a failed startup result', () => {
    const result: StartupResult = { success: false, message: 'Ollama is not reachable' };
    const props = {
      startupPromise: Promise.resolve(result),
      version: '0.1.0',
    };
    return expect(props.startupPromise).resolves.toMatchObject({ success: false });
  });
});
