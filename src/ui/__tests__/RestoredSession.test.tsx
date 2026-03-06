import { describe, it, vi, beforeEach } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  }),
}));

import { RestoredSession } from '../RestoredSession.js';

describe('RestoredSession', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without throwing', () => {
    const stream = new PassThrough();
    const onContinue = vi.fn();
    const { unmount } = render(
      React.createElement(RestoredSession, {
        sessionId: 'abc-123-def-456',
        onContinue,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('renders with a different session ID and does not throw', () => {
    const stream = new PassThrough();
    const onContinue = vi.fn();
    const { unmount } = render(
      React.createElement(RestoredSession, {
        sessionId: 'test-session-id',
        onContinue,
      }),
      { stdout: stream as unknown as NodeJS.WriteStream },
    );
    unmount();
  });
});
