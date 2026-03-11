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

function renderShellText(props: Parameters<typeof AppShell>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const { unmount } = render(React.createElement(AppShell, props), {
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

  it('renders with provider notice without throwing', () => {
    const { unmount } = renderShell({
      notice: 'ollama is unavailable',
    });
    unmount();
  });

  it('renders with network transientError without throwing', () => {
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

describe('AppShell two-row header layout', () => {
  it('renders sess: abbreviation (not session:) in header', () => {
    const output = renderShellText({ statusBar: sampleStatusBar });
    expect(output).toContain('sess:');
    expect(output).not.toContain('session:');
  });

  it('renders version and stage in header', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, version: '1.2.3', stage: 'spec' },
    });
    expect(output).toContain('cobuild v1.2.3');
    expect(output).toContain('spec');
  });

  it('renders provider on the second header row', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, provider: 'codex-cli' },
    });
    expect(output).toContain('codex-cli');
  });

  it('renders model in header when set', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, model: 'mistral' },
    });
    expect(output).toContain('mistral');
  });

  it('renders UNAVAILABLE indicator when providerReady is false', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, providerReady: false },
    });
    expect(output).toContain('UNAVAILABLE');
  });

  it('renders resumabilityContext in header when set', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, resumabilityContext: 'resumed from plan' },
    });
    expect(output).toContain('resumed from plan');
  });

  it('renders truncated session ID (8 chars) in header', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, sessionId: 'abcdef12-1234-5678-abcd-ef1234567890' },
    });
    expect(output).toContain('abcdef12');
  });

  it('does not render model name when provider is codex-cli even if model prop is set', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, provider: 'codex-cli', model: 'llama3' },
    });
    expect(output).not.toContain('llama3');
  });

  it('does not render slash-model syntax when provider is codex-cli', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, provider: 'codex-cli', model: 'mistral' },
    });
    expect(output).not.toContain('/mistral');
  });

  it('renders model name for ollama provider', () => {
    const output = renderShellText({
      statusBar: { ...sampleStatusBar, provider: 'ollama', model: 'llama3' },
    });
    expect(output).toContain('llama3');
  });
});

describe('AppShell notice and error placement', () => {
  it('renders notice text in output', () => {
    const output = renderShellText({ notice: 'Provider unavailable' });
    expect(output).toContain('Notice: Provider unavailable');
  });

  it('renders transient error text in output', () => {
    const output = renderShellText({ transientError: 'Connection refused' });
    expect(output).toContain('Error: Connection refused');
  });

  it('notice and transient error are both shown when both set', () => {
    const output = renderShellText({
      notice: 'Startup notice',
      transientError: 'Something failed',
    });
    expect(output).toContain('Notice: Startup notice');
    expect(output).toContain('Error: Something failed');
  });

  it('notice appears in output when status bar and children are both present', () => {
    const output = renderShellText({
      statusBar: sampleStatusBar,
      notice: 'Provider unavailable',
      children: React.createElement(React.Fragment, null),
    });
    expect(output).toContain('Notice: Provider unavailable');
  });
});

describe('AppShell footer normalization', () => {
  it('renders footer commands from props (single location)', () => {
    const output = renderShellText({
      footer: { commands: ['/finish-now', '/model'], keybindings: [] },
    });
    expect(output).toContain('/finish-now');
    expect(output).toContain('/model');
  });

  it('renders footer keybindings from props (single location)', () => {
    const output = renderShellText({
      footer: { commands: [], keybindings: ['ctrl+c: quit'] },
    });
    expect(output).toContain('ctrl+c: quit');
  });

  it('does not render footer section when both arrays are empty', () => {
    const output = renderShellText({
      footer: { commands: [], keybindings: [] },
    });
    expect(output).not.toContain('Commands:');
    expect(output).not.toContain('Keys:');
  });

  it('renders Commands: label when commands are present', () => {
    const output = renderShellText({
      footer: { commands: ['/help'], keybindings: [] },
    });
    expect(output).toContain('Commands:');
  });

  it('renders Keys: label when keybindings are present', () => {
    const output = renderShellText({
      footer: { commands: [], keybindings: ['enter: confirm'] },
    });
    expect(output).toContain('Keys:');
  });
});
