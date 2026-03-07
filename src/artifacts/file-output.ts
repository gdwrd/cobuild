import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeFilename } from '../utils/paths.js';
import { getLogger } from '../logging/logger.js';

/**
 * Ensures the docs directory exists under the given project directory,
 * creating it (and any parents) if necessary.
 */
export function ensureDocsDir(projectDir: string): string {
  const docsDir = path.join(projectDir, 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
    getLogger().info(`file-output: created docs directory at ${docsDir}`);
  }
  return docsDir;
}

/**
 * Generates a Markdown filename slug from a project name.
 * Uses safeFilename for sanitization, lowercases, and replaces spaces with hyphens.
 */
export function generateFilename(projectName: string): string {
  const sanitized = safeFilename(projectName).toLowerCase().replace(/\s+/g, '-') || 'project';
  return `${sanitized}-spec.md`;
}

/**
 * Sanitizes a raw project name string into a safe filename component.
 * Delegates to safeFilename from utils/paths.
 */
export function sanitizeFilename(name: string): string {
  return safeFilename(name);
}

/**
 * Resolves the output path for an artifact file, handling collisions.
 * If the target filename already exists in docsDir, appends a numeric suffix
 * (e.g. -2, -3, ...) until a free slot is found.
 */
export function resolveOutputPath(docsDir: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  let candidate = path.join(docsDir, filename);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  let suffix = 2;
  while (suffix <= 1000) {
    candidate = path.join(docsDir, `${base}-${suffix}${ext}`);
    if (!fs.existsSync(candidate)) break;
    suffix++;
  }
  if (suffix > 1000) {
    throw new Error(`file-output: could not find a free filename for ${filename} after 1000 attempts`);
  }
  getLogger().info(`file-output: collision detected, using suffix ${suffix} → ${candidate}`);
  return candidate;
}

/**
 * Writes Markdown content to the given file path atomically (tmp + rename).
 * Throws on filesystem errors.
 */
export function writeArtifactFile(filePath: string, content: string): void {
  const logger = getLogger();
  const tmpPath = `${filePath}.${process.pid}.tmp`;

  logger.info(`file-output: writing artifact to ${filePath}`);
  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8' });
    fs.linkSync(tmpPath, filePath);
    fs.unlinkSync(tmpPath);
    logger.info(`file-output: artifact written successfully to ${filePath}`);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    logger.error(`file-output: failed to write artifact to ${filePath}: ${String(err)}`);
    throw err;
  }
}
