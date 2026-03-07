#!/usr/bin/env node
/**
 * Verifies that `npm pack --dry-run` produces only intended runtime files.
 * Files must be under dist/ or be one of the allowed root-level files that
 * npm includes automatically (package.json, README, LICENSE, CHANGELOG, etc.).
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const ALLOWED_ROOTS = new Set([
  'package.json',
  'README.md',
  'LICENSE',
  'RELEASE_NOTES.md',
  'CHANGELOG.md',
]);

const ALLOWED_PREFIXES = ['dist/'];

const DISALLOWED_PATTERNS = [
  /^src\//,
  /^scripts\//,
  /^docs\//,
  /^\.github\//,
  /\.test\.(js|ts)$/,
  /__tests__\//,
];

let raw;
try {
  raw = execSync('npm pack --dry-run --json', {
    cwd: ROOT,
    encoding: 'utf-8',
  });
} catch (err) {
  console.error('ERROR: npm pack --dry-run --json failed');
  console.error(err.message);
  process.exit(1);
}

let packResults;
try {
  packResults = JSON.parse(raw);
} catch {
  console.error('ERROR: Could not parse npm pack --json output');
  console.error(raw);
  process.exit(1);
}

const [packResult] = packResults;
if (!packResult || typeof packResult !== 'object') {
  console.error('ERROR: Unexpected npm pack output format — no package entry found');
  process.exit(1);
}
const files = (packResult.files ?? []).map((f) => f.path);

if (files.length === 0) {
  console.error('ERROR: npm pack reported 0 files — something is wrong');
  process.exit(1);
}

const unexpected = [];

for (const file of files) {
  const isAllowedRoot = ALLOWED_ROOTS.has(file);
  const isAllowedPrefix = ALLOWED_PREFIXES.some((p) => file.startsWith(p));
  const isDisallowed = DISALLOWED_PATTERNS.some((re) => re.test(file));

  if (!isAllowedRoot && (isDisallowed || !isAllowedPrefix)) {
    unexpected.push(file);
  }
}

console.log(`Package: ${packResult.name}@${packResult.version}`);
console.log(`Total files: ${files.length}`);
console.log('');
console.log('Files included:');
for (const file of files) {
  console.log(`  ${file}`);
}

if (unexpected.length > 0) {
  console.error('');
  console.error('ERROR: Unexpected files in package:');
  for (const file of unexpected) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

console.log('');
console.log('Package contents verified — all files are within expected paths.');
