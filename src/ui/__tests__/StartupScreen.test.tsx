import { describe, it, expect } from 'vitest';
import { render } from 'ink';
import React from 'react';
import { PassThrough } from 'node:stream';
import { StartupScreen } from '../StartupScreen.js';
import type { StartupStep } from '../../cli/app-shell.js';

function renderScreen(props: Parameters<typeof StartupScreen>[0]): string {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  const { unmount } = render(React.createElement(StartupScreen, props), {
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

describe('StartupScreen', () => {
  it('renders without throwing with a version', () => {
    const { unmount } = render(
      React.createElement(StartupScreen, { version: '0.1.0' }),
      { stdout: new PassThrough() as unknown as NodeJS.WriteStream },
    );
    unmount();
  });

  it('shows version in output', () => {
    const output = renderScreen({ version: '1.2.3' });
    expect(output).toContain('1.2.3');
  });

  it('shows fallback message when no steps provided', () => {
    const output = renderScreen({ version: '0.0.1' });
    expect(output).toContain('Starting cobuild');
  });

  it('shows step labels when steps are provided', () => {
    const steps: StartupStep[] = [
      { id: 'bootstrap', label: 'Initializing directories', status: 'ok' },
      { id: 'tty', label: 'Checking TTY', status: 'running' },
      { id: 'provider', label: 'Checking provider', status: 'pending' },
      { id: 'session', label: 'Resolving session', status: 'pending' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('Initializing directories');
    expect(output).toContain('Checking TTY');
    expect(output).toContain('Checking provider');
    expect(output).toContain('Resolving session');
  });

  it('shows ok checkmark icon for ok steps', () => {
    const steps: StartupStep[] = [
      { id: 'bootstrap', label: 'Initializing directories', status: 'ok' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('✓');
  });

  it('shows failure icon for failed steps', () => {
    const steps: StartupStep[] = [
      { id: 'bootstrap', label: 'Initializing directories', status: 'failed', detail: 'Permission denied' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('✗');
    expect(output).toContain('Permission denied');
  });

  it('shows warning icon for warning steps', () => {
    const steps: StartupStep[] = [
      { id: 'provider', label: 'Checking provider', status: 'warning', detail: 'not reachable' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('⚠');
    expect(output).toContain('not reachable');
  });

  it('shows running icon for running steps', () => {
    const steps: StartupStep[] = [
      { id: 'provider', label: 'Checking provider', status: 'running' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('⟳');
  });

  it('shows pending icon for pending steps', () => {
    const steps: StartupStep[] = [
      { id: 'session', label: 'Resolving session', status: 'pending' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('·');
  });

  it('shows detail for ok step', () => {
    const steps: StartupStep[] = [
      { id: 'bootstrap', label: 'Initializing directories', status: 'ok', detail: 'new session' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('new session');
  });

  it('renders with empty steps array showing fallback', () => {
    const output = renderScreen({ version: '0.1.0', steps: [] });
    expect(output).toContain('Starting cobuild');
  });

  it('shows actionHint sub-row when actionHint is present', () => {
    const steps: StartupStep[] = [
      {
        id: 'provider',
        label: 'Checking provider (ollama)',
        status: 'warning',
        detail: 'ollama not reachable',
        actionHint: 'codex-cli is available — use --new-session --provider codex-cli to switch',
      },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('codex-cli is available');
    expect(output).toContain('--new-session --provider codex-cli');
  });

  it('does not show actionHint row when actionHint is absent', () => {
    const steps: StartupStep[] = [
      { id: 'provider', label: 'Checking provider (ollama)', status: 'warning', detail: 'not reachable' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).not.toContain('→');
  });

  it('shows actionHint alongside warning detail', () => {
    const steps: StartupStep[] = [
      {
        id: 'provider',
        label: 'Checking provider (ollama)',
        status: 'warning',
        detail: 'connection refused',
        actionHint: 'codex-cli is available — use --new-session --provider codex-cli to switch',
      },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('connection refused');
    expect(output).toContain('codex-cli is available');
  });

  it('shows resumed session detail with stage label', () => {
    const steps: StartupStep[] = [
      { id: 'session', label: 'Resolving session', status: 'ok', detail: 'resumed · spec generation' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('resumed · spec generation');
  });

  it('shows new session detail', () => {
    const steps: StartupStep[] = [
      { id: 'session', label: 'Resolving session', status: 'ok', detail: 'new session' },
    ];
    const output = renderScreen({ version: '1.0.0', steps });
    expect(output).toContain('new session');
  });
});
