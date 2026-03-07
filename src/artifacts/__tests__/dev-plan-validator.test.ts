import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import {
  validateDevPlanStructure,
  assertValidDevPlan,
  DevPlanValidationError,
} from '../dev-plan-validator.js';

function makeValidDevPlan(phaseNumber = 1): string {
  return `# Plan: Phase ${phaseNumber} – Setup and Configuration

## Overview

This plan covers the work for phase ${phaseNumber}.

## Validation Commands

- npm run build
- npm test

---

### Task 1: Initial Setup

- [ ] Configure the project
- [ ] Install dependencies
- [ ] Verify the setup

---

### Task 2: Core Implementation

- [ ] Implement core logic
- [ ] Write unit tests
`;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('validateDevPlanStructure', () => {
  it('returns valid for a correct dev plan', () => {
    const result = validateDevPlanStructure(makeValidDevPlan(1), 1);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid when # Plan: is missing', () => {
    const plan = makeValidDevPlan(1).replace(/^# Plan:.*\n/im, '');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('# Plan:'))).toBe(true);
  });

  it('returns invalid when ## Overview is missing', () => {
    const plan = makeValidDevPlan(1).replace(/^## Overview.*\n/im, '');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('## Overview'))).toBe(true);
  });

  it('returns invalid when ## Validation Commands is missing', () => {
    const plan = makeValidDevPlan(1).replace(/^## Validation Commands.*\n/im, '');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('## Validation Commands'))).toBe(true);
  });

  it('returns invalid when no task sections are present', () => {
    const plan = makeValidDevPlan(1).replace(/^### Task \d+:.*\n/gim, '');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('### Task N:'))).toBe(true);
  });

  it('accepts ### Iteration N: as a valid task section', () => {
    const plan = makeValidDevPlan(1)
      .replace(/### Task 1:/g, '### Iteration 1:')
      .replace(/### Task 2:/g, '### Iteration 2:');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when no checkboxes are present', () => {
    const plan = makeValidDevPlan(1).replace(/- \[ \]/g, '-');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('checkbox'))).toBe(true);
  });

  it('accepts checked checkboxes', () => {
    const plan = makeValidDevPlan(1).replace(/- \[ \]/g, '- [x]');
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(true);
  });

  it('returns invalid when a fenced code block is present', () => {
    const plan = makeValidDevPlan(1) + '\n```typescript\nconst x = 1;\n```\n';
    const result = validateDevPlanStructure(plan, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('code snippet'))).toBe(true);
  });

  it('returns invalid when phase number is not referenced in plan', () => {
    const plan = `# Plan: Some Generic Title

## Overview

This plan covers general work.

## Validation Commands

- npm test

---

### Task 1: Do something

- [ ] First checkbox
`;
    const result = validateDevPlanStructure(plan, 3);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('phase 3'))).toBe(true);
  });

  it('accepts plan that references phase in title', () => {
    const result = validateDevPlanStructure(makeValidDevPlan(5), 5);
    expect(result.valid).toBe(true);
  });

  it('logs an error when validation fails', () => {
    validateDevPlanStructure('# Missing everything', 1);
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/invalid dev plan/);
  });

  it('logs info when validation passes', () => {
    validateDevPlanStructure(makeValidDevPlan(2), 2);
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/valid/);
  });

  it('includes phase number in log messages', () => {
    validateDevPlanStructure('# Missing everything', 4);
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/phase 4/);
  });

  it('returns multiple errors when multiple sections are missing', () => {
    const result = validateDevPlanStructure('nothing here', 1);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('assertValidDevPlan', () => {
  it('does not throw for a valid dev plan', () => {
    expect(() => assertValidDevPlan(makeValidDevPlan(1), 1)).not.toThrow();
  });

  it('throws DevPlanValidationError for an invalid dev plan', () => {
    expect(() => assertValidDevPlan('no content', 1)).toThrow(DevPlanValidationError);
  });

  it('thrown error contains the validation result', () => {
    expect.assertions(3);
    try {
      assertValidDevPlan('no content', 1);
    } catch (err) {
      expect(err).toBeInstanceOf(DevPlanValidationError);
      const validationErr = err as DevPlanValidationError;
      expect(validationErr.result.valid).toBe(false);
      expect(validationErr.result.errors.length).toBeGreaterThan(0);
    }
  });

  it('thrown error message includes error details', () => {
    expect.assertions(1);
    try {
      assertValidDevPlan('no content', 1);
    } catch (err) {
      expect((err as Error).message).toMatch(/Dev plan validation failed/);
    }
  });
});
