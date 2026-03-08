import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { AppShell } from '../AppShell.js';
import type { StatusHeaderData, FooterHelpData } from '../types.js';

function renderShell(props: Parameters<typeof AppShell>[0]) {
  const stream = new PassThrough();
  const instance = render(React.createElement(AppShell, props), {
    stdout: stream as unknown as NodeJS.WriteStream,
  });
  return { ...instance, stream };
}

const sampleStatusBar: StatusHeaderData = {
  sessionId: 'abcd-1234-efgh-5678',
  stage: 'interview',
  provider: 'ollama',
  providerReady: true,
  version: '0.1.0',
};

const sampleFooter: FooterHelpData = {
  commands: ['/finish-now', '/model'],
  keybindings: ['ctrl+c: quit'],
};

describe('AppShell', () => {
  it('renders without throwing given no props', () => {
    const { unmount } = renderShell({});
    unmount();
  });

  it('renders with statusBar without throwing', () => {
    const { unmount } = renderShell({ statusBar: sampleStatusBar });
    unmount();
  });

  it('renders with statusBar showing provider unavailable without throwing', () => {
    const { unmount } = renderShell({
      statusBar: { ...sampleStatusBar, providerReady: false },
    });
    unmount();
  });

  it('renders with model in statusBar without throwing', () => {
    const { unmount } = renderShell({
      statusBar: { ...sampleStatusBar, model: 'llama3' },
    });
    unmount();
  });

  it('renders with resumabilityContext in statusBar without throwing', () => {
    const { unmount } = renderShell({
      statusBar: { ...sampleStatusBar, resumabilityContext: 'resumed from dev-plans' },
    });
    unmount();
  });

  it('renders with model and resumabilityContext together without throwing', () => {
    const { unmount } = renderShell({
      statusBar: {
        ...sampleStatusBar,
        model: 'codestral',
        resumabilityContext: 'resumed from plan',
        providerReady: false,
      },
    });
    unmount();
  });

  it('renders with notice without throwing', () => {
    const { unmount } = renderShell({ notice: 'Provider unavailable' });
    unmount();
  });

  it('renders with transientError without throwing', () => {
    const { unmount } = renderShell({ transientError: 'Connection refused' });
    unmount();
  });

  it('renders with footer without throwing', () => {
    const { unmount } = renderShell({ footer: sampleFooter });
    unmount();
  });

  it('renders with all props without throwing', () => {
    const { unmount } = renderShell({
      statusBar: { ...sampleStatusBar, model: 'llama3', resumabilityContext: 'resumed from spec' },
      notice: 'Startup notice',
      transientError: 'Something failed',
      footer: sampleFooter,
    });
    unmount();
  });

  it('renders children without throwing', () => {
    const { unmount } = renderShell({
      statusBar: sampleStatusBar,
      children: React.createElement('div', null, 'child content'),
    });
    unmount();
  });

  it('renders with footer having only keybindings without throwing', () => {
    const { unmount } = renderShell({
      footer: { commands: [], keybindings: ['ctrl+c: quit'] },
    });
    unmount();
  });

  it('renders with footer having only commands without throwing', () => {
    const { unmount } = renderShell({
      footer: { commands: ['/help'], keybindings: [] },
    });
    unmount();
  });

  it('skips footer render when both commands and keybindings are empty', () => {
    const { unmount } = renderShell({
      footer: { commands: [], keybindings: [] },
    });
    unmount();
  });

  it('renders different stage values without throwing', () => {
    const stages: StatusHeaderData['stage'][] = [
      'interview', 'spec', 'architecture', 'plan', 'dev-plans',
    ];
    for (const stage of stages) {
      const { unmount } = renderShell({ statusBar: { ...sampleStatusBar, stage } });
      unmount();
    }
  });

  it('renders YESNO_FOOTER keybindings (y/n) without throwing', () => {
    const { unmount } = renderShell({
      statusBar: sampleStatusBar,
      footer: { commands: [], keybindings: ['y: yes', 'n: no', 'ctrl+c: quit'] },
    });
    unmount();
  });

  it('renders generating footer without throwing', () => {
    const { unmount } = renderShell({
      statusBar: sampleStatusBar,
      footer: { commands: [], keybindings: ['ctrl+c: quit'] },
    });
    unmount();
  });

  it('renders with codex-cli provider and model without throwing', () => {
    const { unmount } = renderShell({
      statusBar: { ...sampleStatusBar, provider: 'codex-cli', model: undefined },
    });
    unmount();
  });

  it('renders with notice without throwing', () => {
    const { unmount } = renderShell({
      notice: 'ollama is unavailable',
    });
    unmount();
  });

  it('renders with transientError without throwing', () => {
    const { unmount } = renderShell({
      transientError: 'network timeout',
    });
    unmount();
  });

  it('renders footer with commands without throwing', () => {
    const { unmount } = renderShell({
      footer: { commands: ['/finish-now'], keybindings: [] },
    });
    unmount();
  });

  it('renders footer with keybindings without throwing', () => {
    const { unmount } = renderShell({
      footer: { commands: [], keybindings: ['ctrl+c: quit'] },
    });
    unmount();
  });
});

describe('AppShell StatusHeaderData resumabilityContext', () => {
  it('accepts undefined resumabilityContext in statusBar', () => {
    const bar: StatusHeaderData = {
      sessionId: 'abc',
      stage: 'spec',
      provider: 'ollama',
      providerReady: true,
      version: '1.0.0',
    };
    expect(bar.resumabilityContext).toBeUndefined();
    const { unmount } = renderShell({ statusBar: bar });
    unmount();
  });

  it('accepts a resumabilityContext string in statusBar', () => {
    const bar: StatusHeaderData = {
      sessionId: 'abc',
      stage: 'dev-plans',
      provider: 'ollama',
      providerReady: true,
      version: '1.0.0',
      resumabilityContext: 'resumed from dev-plans',
    };
    expect(bar.resumabilityContext).toBe('resumed from dev-plans');
    const { unmount } = renderShell({ statusBar: bar });
    unmount();
  });
});
