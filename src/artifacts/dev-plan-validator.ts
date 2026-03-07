import { getLogger } from '../logging/logger.js';

export interface DevPlanValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDevPlanStructure(
  content: string,
  phaseNumber: number,
): DevPlanValidationResult {
  const logger = getLogger();
  const errors: string[] = [];

  // Validate required top-level sections
  if (!/^#\s+Plan:/im.test(content)) {
    errors.push('missing required section: # Plan:');
  }

  if (!/^##\s+Overview/im.test(content)) {
    errors.push('missing required section: ## Overview');
  }

  if (!/^##\s+Validation\s+Commands/im.test(content)) {
    errors.push('missing required section: ## Validation Commands');
  }

  // Validate at least one task section using ### Task N: or ### Iteration N:
  const taskPattern = /^###\s+(Task|Iteration)\s+\d+:/im;
  if (!taskPattern.test(content)) {
    errors.push('plan must contain at least one ### Task N: or ### Iteration N: section');
  }

  // Validate tasks are Markdown checkboxes
  const checkboxPattern = /^- \[[ xX]\]/m;
  if (!checkboxPattern.test(content)) {
    errors.push('plan must contain at least one Markdown checkbox task (- [ ] or - [x])');
  }

  // Reject plans containing code snippets (fenced code blocks)
  const codeBlockPattern = /^```/m;
  if (codeBlockPattern.test(content)) {
    errors.push('plan must not contain code snippets (fenced code blocks)');
  }

  // Ensure plan title references the current phase
  const titleMatch = /^#\s+Plan:(.+)/im.exec(content);
  if (titleMatch) {
    const title = titleMatch[1];
    const phaseRef = new RegExp(`phase\\s*${phaseNumber}\\b`, 'i');
    if (!phaseRef.test(title) && !phaseRef.test(content.slice(0, 200))) {
      errors.push(
        `plan title or opening does not reference the current phase (phase ${phaseNumber})`,
      );
    }
  }

  if (errors.length > 0) {
    logger.error(
      `dev-plan validator: invalid dev plan for phase ${phaseNumber} — ${errors.join('; ')}`,
    );
    return { valid: false, errors };
  }

  logger.info(`dev-plan validator: dev plan for phase ${phaseNumber} is valid`);
  return { valid: true, errors: [] };
}

export class DevPlanValidationError extends Error {
  constructor(public readonly result: DevPlanValidationResult) {
    super(`Dev plan validation failed: ${result.errors.join('; ')}`);
    this.name = 'DevPlanValidationError';
  }
}

export function assertValidDevPlan(content: string, phaseNumber: number): void {
  const result = validateDevPlanStructure(content, phaseNumber);
  if (!result.valid) {
    throw new DevPlanValidationError(result);
  }
}
