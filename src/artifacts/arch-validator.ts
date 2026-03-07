import { getLogger } from '../logging/logger.js';

export interface ArchValidationResult {
  valid: boolean;
  missingSections: string[];
}

interface RequiredSection {
  name: string;
  patterns: RegExp[];
}

const REQUIRED_SECTIONS: RequiredSection[] = [
  {
    name: 'system components',
    patterns: [/^#{1,3}\s+(system\s+components?|components?|architecture\s+overview)/im],
  },
  {
    name: 'data flow',
    patterns: [/^#{1,3}\s+(data\s+flow|data\s+flows?)/im],
  },
  {
    name: 'external integrations',
    patterns: [/^#{1,3}\s+(external\s+integrations?|integrations?|third.party)/im],
  },
  {
    name: 'storage choices',
    patterns: [/^#{1,3}\s+(storage(\s+choices?)?|data\s+storage|databases?)/im],
  },
  {
    name: 'deployment/runtime model',
    patterns: [/^#{1,3}\s+(deployment(\/runtime\s+model|\s+model|\s+&\s+runtime)?|runtime\s+model|infrastructure)/im],
  },
  {
    name: 'security considerations',
    patterns: [/^#{1,3}\s+(security(\s+considerations?)?)/im],
  },
  {
    name: 'failure handling',
    patterns: [/^#{1,3}\s+(failure\s+handling|error\s+handling|fault\s+tolerance|resilience)/im],
  },
];

export function validateArchStructure(content: string): ArchValidationResult {
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
      `arch validator: invalid architecture — missing sections: ${missingSections.join(', ')}`,
    );
    return { valid: false, missingSections };
  }

  logger.info('arch validator: architecture structure is valid');
  return { valid: true, missingSections: [] };
}

export class ArchValidationError extends Error {
  constructor(public readonly result: ArchValidationResult) {
    super(`Architecture validation failed: missing sections — ${result.missingSections.join(', ')}`);
    this.name = 'ArchValidationError';
  }
}

export function assertValidArch(content: string): void {
  const result = validateArchStructure(content);
  if (!result.valid) {
    throw new ArchValidationError(result);
  }
}
