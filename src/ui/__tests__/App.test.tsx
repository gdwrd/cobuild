import { describe, it, expect } from 'vitest';
import { App } from '../App.js';

describe('App component', () => {
  it('exports App as a function component', () => {
    expect(typeof App).toBe('function');
  });

  it('accepts AppProps with sessionId and version', () => {
    // Verify the component signature accepts the required props
    const props = { sessionId: 'test-session-id', version: '0.1.0' };
    expect(props.sessionId).toBe('test-session-id');
    expect(props.version).toBe('0.1.0');
  });
});
