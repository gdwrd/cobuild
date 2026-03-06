#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  .version(getVersion())
  .option('--new-session', 'Start a new session, discarding any existing session')
  .action(() => {
    console.log('cobuild starting...');
    console.log('Use --help to see available options');
  });

program.parse(process.argv);
