import { getLogger } from '../logging/logger.js';

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
}

interface PhaseMatch {
  number: number;
  startIndex: number;
}

const REQUIRED_PHASE_FIELDS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: 'goal',
    patterns: [/^#{2,4}\s+goal/im],
  },
  {
    name: 'scope',
    patterns: [/^#{2,4}\s+scope/im],
  },
  {
    name: 'deliverables',
    patterns: [/^#{2,4}\s+deliverables?/im],
  },
  {
    name: 'dependencies',
    patterns: [/^#{2,4}\s+dependencies/im],
  },
  {
    name: 'acceptance criteria',
    patterns: [/^#{2,4}\s+acceptance\s+criteria/im],
  },
];

const MIN_PHASES = 4;
const MAX_PHASES = 8;

function findPhases(content: string): PhaseMatch[] {
  const phasePattern = /^#{1,3}\s+Phase\s+(\d+)/gim;
  const phases: PhaseMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = phasePattern.exec(content)) !== null) {
    phases.push({ number: parseInt(match[1], 10), startIndex: match.index });
  }
  return phases;
}

function extractPhaseContent(content: string, phases: PhaseMatch[], index: number): string {
  const start = phases[index].startIndex;
  const end = index + 1 < phases.length ? phases[index + 1].startIndex : content.length;
  return content.slice(start, end);
}

export function validatePlanStructure(content: string): PlanValidationResult {
  const logger = getLogger();
  const errors: string[] = [];

  const phases = findPhases(content);

  if (phases.length < MIN_PHASES || phases.length > MAX_PHASES) {
    errors.push(
      `plan must contain ${MIN_PHASES}–${MAX_PHASES} phases, found ${phases.length}`,
    );
  }

  // Validate sequential ordering
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].number !== i + 1) {
      errors.push(
        `phases must be numbered sequentially starting at 1; phase at position ${i + 1} has number ${phases[i].number}`,
      );
      break;
    }
  }

  // Validate required fields in each phase
  for (let i = 0; i < phases.length; i++) {
    const phaseContent = extractPhaseContent(content, phases, i);
    const missingFields: string[] = [];
    for (const field of REQUIRED_PHASE_FIELDS) {
      const found = field.patterns.some((p) => p.test(phaseContent));
      if (!found) {
        missingFields.push(field.name);
      }
    }
    if (missingFields.length > 0) {
      errors.push(`Phase ${phases[i].number} is missing required fields: ${missingFields.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    logger.error(`plan validator: invalid plan — ${errors.join('; ')}`);
    return { valid: false, errors };
  }

  logger.info('plan validator: plan structure is valid');
  return { valid: true, errors: [] };
}

export class PlanValidationError extends Error {
  constructor(public readonly result: PlanValidationResult) {
    super(`Plan validation failed: ${result.errors.join('; ')}`);
    this.name = 'PlanValidationError';
  }
}

export function assertValidPlan(content: string): void {
  const result = validatePlanStructure(content);
  if (!result.valid) {
    throw new PlanValidationError(result);
  }
}
