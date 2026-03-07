import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import { extractPhases } from '../plan-parser.js';

function makePhase(n: number): string {
  return `## Phase ${n}: Phase ${n} Title

### Goal

This is the goal for phase ${n}.

### Scope

This is the scope for phase ${n}.

### Deliverables

- Deliverable A for phase ${n}
- Deliverable B for phase ${n}

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

describe('extractPhases', () => {
  it('returns an empty array when no phases are present', () => {
    const result = extractPhases('# Plan\n\nNo phases here.\n');
    expect(result).toHaveLength(0);
  });

  it('extracts the correct number of phases', () => {
    const result = extractPhases(makeValidPlan(5));
    expect(result).toHaveLength(5);
  });

  it('extracts phase number correctly', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].number).toBe(1);
    expect(result[1].number).toBe(2);
    expect(result[3].number).toBe(4);
  });

  it('extracts phase title correctly', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].title).toBe('Phase 1 Title');
    expect(result[2].title).toBe('Phase 3 Title');
  });

  it('extracts goal content', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].goal).toBe('This is the goal for phase 1.');
  });

  it('extracts scope content', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].scope).toBe('This is the scope for phase 1.');
  });

  it('extracts deliverables content', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].deliverables).toContain('Deliverable A for phase 1');
    expect(result[0].deliverables).toContain('Deliverable B for phase 1');
  });

  it('extracts dependencies content', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].dependencies).toContain('Dependency from phase 0');
  });

  it('extracts acceptance criteria content', () => {
    const result = extractPhases(makeValidPlan(4));
    expect(result[0].acceptanceCriteria).toContain('Feature X works');
    expect(result[0].acceptanceCriteria).toContain('Tests pass');
  });

  it('correctly scopes each phase to its own content', () => {
    const result = extractPhases(makeValidPlan(5));
    expect(result[0].goal).toContain('phase 1');
    expect(result[1].goal).toContain('phase 2');
    expect(result[4].goal).toContain('phase 5');
  });

  it('handles phases with h1 headings', () => {
    const plan = `# Phase 1: First Phase\n\n### Goal\nGoal text.\n### Scope\nScope text.\n### Deliverables\nDel text.\n### Dependencies\nDep text.\n### Acceptance Criteria\nAC text.\n\n# Phase 2: Second Phase\n\n### Goal\nGoal 2.\n### Scope\nScope 2.\n### Deliverables\nDel 2.\n### Dependencies\nDep 2.\n### Acceptance Criteria\nAC 2.\n`;
    const result = extractPhases(plan);
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].title).toBe('First Phase');
    expect(result[1].number).toBe(2);
  });

  it('returns empty string for missing section fields', () => {
    const planMissingGoal = `## Phase 1: Title\n\n### Scope\nScope text.\n### Deliverables\nDel.\n### Dependencies\nDep.\n### Acceptance Criteria\nAC.\n\n## Phase 2: Title\n\n### Goal\nGoal 2.\n### Scope\nScope 2.\n### Deliverables\nDel 2.\n### Dependencies\nDep 2.\n### Acceptance Criteria\nAC 2.\n\n## Phase 3: Title\n\n### Goal\nGoal 3.\n### Scope\nScope 3.\n### Deliverables\nDel 3.\n### Dependencies\nDep 3.\n### Acceptance Criteria\nAC 3.\n\n## Phase 4: Title\n\n### Goal\nGoal 4.\n### Scope\nScope 4.\n### Deliverables\nDel 4.\n### Dependencies\nDep 4.\n### Acceptance Criteria\nAC 4.\n`;
    const result = extractPhases(planMissingGoal);
    expect(result[0].goal).toBe('');
    expect(result[1].goal).toBe('Goal 2.');
  });

  it('is case-insensitive for section headings', () => {
    const plan = makeValidPlan(4)
      .replace(/### Goal/g, '### GOAL')
      .replace(/### Scope/g, '### SCOPE')
      .replace(/### Deliverables/g, '### DELIVERABLES')
      .replace(/### Dependencies/g, '### DEPENDENCIES')
      .replace(/### Acceptance Criteria/g, '### ACCEPTANCE CRITERIA');
    const result = extractPhases(plan);
    expect(result).toHaveLength(4);
    expect(result[0].goal).not.toBe('');
    expect(result[0].scope).not.toBe('');
    expect(result[0].deliverables).not.toBe('');
    expect(result[0].dependencies).not.toBe('');
    expect(result[0].acceptanceCriteria).not.toBe('');
  });

  it('accepts "Deliverable" singular for deliverables field', () => {
    const plan = makeValidPlan(4).replace(/### Deliverables/g, '### Deliverable');
    const result = extractPhases(plan);
    expect(result[0].deliverables).toContain('Deliverable A for phase 1');
  });

  it('logs info after successful extraction', () => {
    extractPhases(makeValidPlan(4));
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringMatching(/extracted 4 phases/),
    );
  });

  it('logs a warning when no phases are found', () => {
    extractPhases('# Plan\n\nNo phases.\n');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/no phases found/),
    );
  });

  it('logs debug for each extracted phase', () => {
    extractPhases(makeValidPlan(4));
    expect(mockLogger.debug).toHaveBeenCalledTimes(4);
    expect(mockLogger.debug.mock.calls[0][0]).toMatch(/Phase 1/);
  });
});
