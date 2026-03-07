#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import React from 'react';
import { render } from 'ink';
import { createConfig } from './config.js';
import { runStartup } from './app-shell.js';
import { ScreenController } from '../ui/ScreenController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const version = getVersion();

program
  .name('cobuild')
  .description('Interactive AI-powered CLI build assistant')
  .version(version, '-v, --version', 'Print the current version')
  .option('--new-session', 'Start a new session, discarding any existing session')
  .option('--verbose', 'Enable verbose logging')
  .option('--provider <provider>', 'AI provider to use: ollama (default) or codex-cli')
  .addHelpText(
    'after',
    `
Examples:
  cobuild                           Start cobuild, resuming the last session
  cobuild --new-session             Start cobuild with a fresh session
  cobuild --provider codex-cli      Start cobuild using the Codex CLI provider
  cobuild --help                    Show this help message
`
  )
  .action(async (opts: { newSession?: boolean; verbose?: boolean; provider?: string }) => {
    const rawProvider = opts.provider;
    const provider = rawProvider === 'codex-cli' ? 'codex-cli' : 'ollama';
    const config = createConfig({
      version,
      newSession: opts.newSession ?? false,
      verbose: opts.verbose ?? false,
      provider,
    });

    const startupPromise = runStartup(config);

    render(React.createElement(ScreenController, { startupPromise, version }));
  });

program.parse(process.argv);
