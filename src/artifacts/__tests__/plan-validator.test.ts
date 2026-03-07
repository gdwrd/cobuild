import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import { validatePlanStructure, assertValidPlan, PlanValidationError } from '../plan-validator.js';

function makePhase(n: number): string {
  return `## Phase ${n}: Phase ${n} Title

### Goal

This is the goal for phase ${n}.

### Scope

This is the scope for phase ${n}.

### Deliverables

- Deliverable A
- Deliverable B

### Dependencies

- Dependency from phase ${n - 1}

### Acceptance Criteria

- Feature X works
- Tests pass

`;
}

function makeValidPlan(phaseCount = 5): string {
  let plan = '# High-Level Development Plan\n\n';
  for (let i = 1; i <= phaseCount; i++) {
    plan += makePhase(i);
  }
  return plan;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('validatePlanStructure', () => {
  it('returns valid for a plan with 4 phases', () => {
    const result = validatePlanStructure(makeValidPlan(4));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid for a plan with 8 phases', () => {
    const result = validatePlanStructure(makeValidPlan(8));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid for a plan with 3 phases', () => {
    const result = validatePlanStructure(makeValidPlan(3));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('3'))).toBe(true);
  });

  it('returns invalid for a plan with 9 phases', () => {
    const result = validatePlanStructure(makeValidPlan(9));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('9'))).toBe(true);
  });

  it('returns invalid for empty content', () => {
    const result = validatePlanStructure('# Plan\n\nNo phases here.\n');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('found 0'))).toBe(true);
  });

  it('returns invalid when phases are not sequentially numbered', () => {
    const plan = makePhase(1) + makePhase(3) + makePhase(4) + makePhase(5) + makePhase(6);
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sequentially'))).toBe(true);
  });

  it('returns invalid when phases start at 0', () => {
    const plan = makePhase(0) + makePhase(1) + makePhase(2) + makePhase(3) + makePhase(4);
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sequentially'))).toBe(true);
  });

  it('returns invalid when goal is missing from a phase', () => {
    const plan = makeValidPlan(5).replace(/### Goal[\s\S]*?(?=### Scope)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('goal'))).toBe(true);
  });

  it('returns invalid when scope is missing from a phase', () => {
    const plan = makeValidPlan(5).replace(/### Scope[\s\S]*?(?=### Deliverables)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('scope'))).toBe(true);
  });

  it('returns invalid when deliverables is missing from a phase', () => {
    const plan = makeValidPlan(5).replace(/### Deliverables[\s\S]*?(?=### Dependencies)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('deliverables'))).toBe(true);
  });

  it('returns invalid when dependencies is missing from a phase', () => {
    const plan = makeValidPlan(5).replace(/### Dependencies[\s\S]*?(?=### Acceptance)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('dependencies'))).toBe(true);
  });

  it('returns invalid when acceptance criteria is missing from a phase', () => {
    const plan = makeValidPlan(5).replace(/### Acceptance Criteria[\s\S]*?(?=\n## Phase|\n$|$)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('acceptance criteria'))).toBe(true);
  });

  it('reports phase number in missing fields error', () => {
    const plan = makeValidPlan(4).replace(/### Goal[\s\S]*?(?=### Scope)/, '');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Phase 1'))).toBe(true);
  });

  it('is case-insensitive for phase field headings', () => {
    const plan = makeValidPlan(4)
      .replace(/### Goal/g, '### GOAL')
      .replace(/### Scope/g, '### SCOPE')
      .replace(/### Deliverables/g, '### DELIVERABLES')
      .replace(/### Dependencies/g, '### DEPENDENCIES')
      .replace(/### Acceptance Criteria/g, '### ACCEPTANCE CRITERIA');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(true);
  });

  it('accepts "Deliverable" singular as deliverables heading', () => {
    const plan = makeValidPlan(4).replace(/### Deliverables/g, '### Deliverable');
    const result = validatePlanStructure(plan);
    expect(result.valid).toBe(true);
  });

  it('logs an error when validation fails', () => {
    validatePlanStructure('# Plan\n\nNo phases.\n');
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/invalid plan/);
  });

  it('logs info when validation passes', () => {
    validatePlanStructure(makeValidPlan(5));
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/valid/);
  });
});

describe('assertValidPlan', () => {
  it('does not throw for a valid plan', () => {
    expect(() => assertValidPlan(makeValidPlan(5))).not.toThrow();
  });

  it('throws PlanValidationError for an invalid plan', () => {
    expect(() => assertValidPlan('no phases')).toThrow(PlanValidationError);
  });

  it('thrown error contains the validation result', () => {
    expect.assertions(3);
    try {
      assertValidPlan('no phases');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanValidationError);
      const validationErr = err as PlanValidationError;
      expect(validationErr.result.valid).toBe(false);
      expect(validationErr.result.errors.length).toBeGreaterThan(0);
    }
  });

  it('thrown error message includes error details', () => {
    expect.assertions(1);
    try {
      assertValidPlan('no phases');
    } catch (err) {
      expect((err as Error).message).toMatch(/Plan validation failed/);
    }
  });
});
