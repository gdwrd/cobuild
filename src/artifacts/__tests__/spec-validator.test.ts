import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import { validateSpecStructure, assertValidSpec, SpecValidationError } from '../spec-validator.js';

const VALID_SPEC = `# My Project Spec

## Project Overview

This project does something useful.

## Functional Requirements

- Feature A
- Feature B

## Acceptance Criteria

- All tests pass
- Documentation is complete
`;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('validateSpecStructure', () => {
  it('returns valid for a spec with all required sections', () => {
    const result = validateSpecStructure(VALID_SPEC);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toHaveLength(0);
  });

  it('returns invalid when project overview is missing', () => {
    const content = `# Spec\n\n## Functional Requirements\n\n- A\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('project overview');
  });

  it('returns invalid when functional requirements is missing', () => {
    const content = `# Spec\n\n## Project Overview\n\nDesc\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('functional requirements');
  });

  it('returns invalid when acceptance criteria is missing', () => {
    const content = `# Spec\n\n## Project Overview\n\nDesc\n\n## Functional Requirements\n\n- A\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('acceptance criteria');
  });

  it('lists all missing sections when all are absent', () => {
    const result = validateSpecStructure('# Just a title\n\nSome content.\n');
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('project overview');
    expect(result.missingSections).toContain('functional requirements');
    expect(result.missingSections).toContain('acceptance criteria');
    expect(result.missingSections).toHaveLength(3);
  });

  it('accepts "Description" as a project overview section heading', () => {
    const content = `# Spec\n\n## Description\n\nDesc\n\n## Functional Requirements\n\n- A\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Project Description" as a project overview section heading', () => {
    const content = `# Spec\n\n## Project Description\n\nDesc\n\n## Functional Requirements\n\n- A\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Overview" as a project overview section heading', () => {
    const content = `# Spec\n\n## Overview\n\nDesc\n\n## Functional Requirements\n\n- A\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(true);
  });

  it('accepts "Requirements" as functional requirements heading', () => {
    const content = `# Spec\n\n## Project Overview\n\nDesc\n\n## Requirements\n\n- A\n\n## Acceptance Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(true);
  });

  it('rejects bare "Criteria" heading without "acceptance" prefix', () => {
    const content = `# Spec\n\n## Project Overview\n\nDesc\n\n## Functional Requirements\n\n- A\n\n## Criteria\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('acceptance criteria');
  });

  it('is case-insensitive for section headings', () => {
    const content = `# Spec\n\n## PROJECT OVERVIEW\n\nDesc\n\n## FUNCTIONAL REQUIREMENTS\n\n- A\n\n## ACCEPTANCE CRITERIA\n\n- B\n`;
    const result = validateSpecStructure(content);
    expect(result.valid).toBe(true);
  });

  it('logs an error when validation fails', () => {
    validateSpecStructure('no sections here');
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/missing sections/);
  });

  it('logs info when validation passes', () => {
    validateSpecStructure(VALID_SPEC);
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/valid/);
  });
});

describe('assertValidSpec', () => {
  it('does not throw for a valid spec', () => {
    expect(() => assertValidSpec(VALID_SPEC)).not.toThrow();
  });

  it('throws SpecValidationError for an invalid spec', () => {
    expect(() => assertValidSpec('no sections')).toThrow(SpecValidationError);
  });

  it('thrown error contains the validation result', () => {
    expect.assertions(3);
    try {
      assertValidSpec('no sections');
    } catch (err) {
      expect(err).toBeInstanceOf(SpecValidationError);
      const validationErr = err as SpecValidationError;
      expect(validationErr.result.valid).toBe(false);
      expect(validationErr.result.missingSections.length).toBeGreaterThan(0);
    }
  });

  it('thrown error message includes missing section names', () => {
    expect.assertions(1);
    try {
      assertValidSpec('no sections');
    } catch (err) {
      expect((err as Error).message).toMatch(/project overview/);
    }
  });
});
