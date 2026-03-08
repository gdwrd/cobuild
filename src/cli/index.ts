#!/usr/bin/env node
import { program, Option } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import React from 'react';
import { render } from 'ink';
import { createConfig } from './config.js';
import { runStartup, createStartupProgressChannel } from './app-shell.js';
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
  .addOption(new Option('--provider <provider>', 'AI provider to use').choices(['ollama', 'codex-cli']).default('ollama'))
  .addHelpText(
    'after',
    `
Examples:
  cobuild                           Start cobuild, resuming the last session
  cobuild --new-session             Start cobuild with a fresh session
  cobuild --provider codex-cli      Start cobuild using the Codex CLI provider
  cobuild --help                    Show this help message

Interview slash commands (type during the interview):
  /finish-now   End the interview now and begin artifact generation
  /model        List and switch Ollama models (/model <name> to override directly)
  /provider     Switch provider mid-session (/provider ollama|codex-cli)
  /help         Show the full command reference inline

The UI shows a persistent status bar (version, stage, provider, model) and
per-screen keybinding hints. Use ctrl+c to quit at any point.
`
  )
  .action(async (opts: { newSession?: boolean; verbose?: boolean; provider: string }) => {
    const provider = opts.provider as 'ollama' | 'codex-cli';
    const config = createConfig({
      version,
      newSession: opts.newSession ?? false,
      verbose: opts.verbose ?? false,
      provider,
    });

    const { channel: startupProgressChannel, onProgress } = createStartupProgressChannel();
    const startupPromise = runStartup(config, onProgress);

    render(React.createElement(ScreenController, { startupPromise, startupProgressChannel, version }));
  });

program.parse(process.argv);
