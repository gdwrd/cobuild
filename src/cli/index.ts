#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createConfig } from './config.js';
import { runStartup } from './app-shell.js';

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

program
  .name('cobuild')
  .description('Interactive AI-powered CLI build assistant')
  .version(getVersion(), '-v, --version', 'Print the current version')
  .option('--new-session', 'Start a new session, discarding any existing session')
  .option('--verbose', 'Enable verbose logging')
  .addHelpText(
    'after',
    `
Examples:
  cobuild                 Start cobuild, resuming the last session
  cobuild --new-session   Start cobuild with a fresh session
  cobuild --help          Show this help message
`
  )
  .action(async (opts: { newSession?: boolean; verbose?: boolean }) => {
    const config = createConfig({
      version: getVersion(),
      newSession: opts.newSession ?? false,
      verbose: opts.verbose ?? false,
    });

    const result = await runStartup(config);

    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }

    console.log(result.message);
  });

program.parse(process.argv);
