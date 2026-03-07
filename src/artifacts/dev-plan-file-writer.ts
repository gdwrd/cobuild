import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeFilename } from '../utils/paths.js';
import { getLogger } from '../logging/logger.js';
import { resolveOutputPath, writeArtifactFile } from './file-output.js';
import type { PlanPhase } from '../session/session.js';

/**
 * Ensures the docs/plans directory exists under the given project directory,
 * creating it (and any parents) if necessary.
 */
export function ensurePlansDir(projectDir: string): string {
  const plansDir = path.join(projectDir, 'docs', 'plans');
  if (!fs.existsSync(plansDir)) {
    fs.mkdirSync(plansDir, { recursive: true });
    getLogger().info(`dev-plan-file-writer: created plans directory at ${plansDir}`);
  }
  return plansDir;
}

/**
 * Generates a filename for a dev plan in the format:
 * YYYY-MM-DD-phase-<number>-<sanitized-title>.md
 */
export function generateDevPlanFilename(phase: PlanPhase, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const sanitizedTitle = safeFilename(phase.title).toLowerCase().replace(/\s+/g, '-') || 'phase';

  return `${dateStr}-phase-${phase.number}-${sanitizedTitle}.md`;
}

export interface DevPlanFileResult {
  filePath: string;
}

/**
 * Writes a dev plan Markdown file under docs/plans/ in the project directory.
 * Handles directory creation, filename collision detection, and atomic write.
 */
export function writeDevPlanFile(
  projectDir: string,
  phase: PlanPhase,
  content: string,
): DevPlanFileResult {
  const logger = getLogger();

  const plansDir = ensurePlansDir(projectDir);
  const filename = generateDevPlanFilename(phase);
  const filePath = resolveOutputPath(plansDir, filename);

  logger.info(
    `dev-plan-file-writer: writing dev plan for phase ${phase.number} to ${filePath}`,
  );

  writeArtifactFile(filePath, content);

  logger.info(
    `dev-plan-file-writer: dev plan for phase ${phase.number} written successfully at ${filePath}`,
  );

  return { filePath };
}
