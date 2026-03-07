import { getLogger } from '../logging/logger.js';

export interface SpecValidationResult {
  valid: boolean;
  missingSections: string[];
}

interface RequiredSection {
  name: string;
  patterns: RegExp[];
}

const REQUIRED_SECTIONS: RequiredSection[] = [
  {
    name: 'project overview',
    patterns: [/^#{1,3}\s+(project\s+overview|overview|description|project\s+description)/im],
  },
  {
    name: 'functional requirements',
    patterns: [/^#{1,3}\s+(functional\s+requirements|requirements)/im],
  },
  {
    name: 'acceptance criteria',
    patterns: [/^#{1,3}\s+(acceptance\s+criteria|criteria)/im],
  },
];

export function validateSpecStructure(content: string): SpecValidationResult {
  const logger = getLogger();
  const missingSections: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const found = section.patterns.some((pattern) => pattern.test(content));
    if (!found) {
      missingSections.push(section.name);
    }
  }

  if (missingSections.length > 0) {
    logger.error(
      `spec validator: invalid spec — missing sections: ${missingSections.join(', ')}`,
    );
    return { valid: false, missingSections };
  }

  logger.info('spec validator: spec structure is valid');
  return { valid: true, missingSections: [] };
}

export class SpecValidationError extends Error {
  constructor(public readonly result: SpecValidationResult) {
    super(`Spec validation failed: missing sections — ${result.missingSections.join(', ')}`);
    this.name = 'SpecValidationError';
  }
}

export function assertValidSpec(content: string): void {
  const result = validateSpecStructure(content);
  if (!result.valid) {
    throw new SpecValidationError(result);
  }
}
