import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { loadAndValidatePhases, PhaseMetadataError } from '../dev-plan-phases.js';
import type { Session } from '../../session/session.js';
import type { PlanPhase } from '../../session/session.js';

const makePhase = (number: number): PlanPhase => ({
  number,
  title: `Phase ${number}`,
  goal: 'goal',
  scope: 'scope',
  deliverables: 'deliverables',
  dependencies: 'none',
  acceptanceCriteria: 'passes',
});

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/work',
  completed: true,
  stage: 'plan',
  transcript: [],
  ...overrides,
});

const makePhases = (count: number): PlanPhase[] =>
  Array.from({ length: count }, (_, i) => makePhase(i + 1));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('loadAndValidatePhases', () => {
  it('throws PhaseMetadataError when extractedPhases is undefined', () => {
    const session = makeSession({ extractedPhases: undefined });
    expect(() => loadAndValidatePhases(session)).toThrow(PhaseMetadataError);
    expect(() => loadAndValidatePhases(session)).toThrow('No phase metadata available');
  });

  it('throws PhaseMetadataError when extractedPhases is empty', () => {
    const session = makeSession({ extractedPhases: [] });
    expect(() => loadAndValidatePhases(session)).toThrow(PhaseMetadataError);
    expect(() => loadAndValidatePhases(session)).toThrow('No phase metadata available');
  });

  it('throws PhaseMetadataError when phase count is below minimum (3 phases)', () => {
    const session = makeSession({ extractedPhases: makePhases(3) });
    expect(() => loadAndValidatePhases(session)).toThrow(PhaseMetadataError);
    expect(() => loadAndValidatePhases(session)).toThrow('outside allowed range');
  });

  it('throws PhaseMetadataError when phase count exceeds maximum (9 phases)', () => {
    const session = makeSession({ extractedPhases: makePhases(9) });
    expect(() => loadAndValidatePhases(session)).toThrow(PhaseMetadataError);
    expect(() => loadAndValidatePhases(session)).toThrow('outside allowed range');
  });

  it('returns iterator for minimum valid phase count (4)', () => {
    const phases = makePhases(4);
    const session = makeSession({ extractedPhases: phases });
    const result = loadAndValidatePhases(session);
    expect(result.phases).toHaveLength(4);
    expect(result.totalCount).toBe(4);
  });

  it('returns iterator for maximum valid phase count (8)', () => {
    const phases = makePhases(8);
    const session = makeSession({ extractedPhases: phases });
    const result = loadAndValidatePhases(session);
    expect(result.phases).toHaveLength(8);
    expect(result.totalCount).toBe(8);
  });

  it('returns iterator for mid-range phase count (6)', () => {
    const phases = makePhases(6);
    const session = makeSession({ extractedPhases: phases });
    const result = loadAndValidatePhases(session);
    expect(result.phases).toHaveLength(6);
    expect(result.totalCount).toBe(6);
  });

  it('returns phases in sequential order', () => {
    const phases = makePhases(5);
    const session = makeSession({ extractedPhases: phases });
    const result = loadAndValidatePhases(session);
    expect(result.phases.map((p) => p.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns a copy of phases, not the original array reference', () => {
    const phases = makePhases(4);
    const session = makeSession({ extractedPhases: phases });
    const result = loadAndValidatePhases(session);
    expect(result.phases).not.toBe(phases);
  });

  it('preserves all phase fields', () => {
    const phase: PlanPhase = {
      number: 1,
      title: 'Foundation',
      goal: 'Build base',
      scope: 'Core modules',
      deliverables: 'Working skeleton',
      dependencies: 'None',
      acceptanceCriteria: 'Tests pass',
    };
    const session = makeSession({ extractedPhases: [phase, makePhase(2), makePhase(3), makePhase(4)] });
    const result = loadAndValidatePhases(session);
    expect(result.phases[0]).toEqual(phase);
  });

  it('error message includes actual count and allowed range when count is too low', () => {
    const session = makeSession({ extractedPhases: makePhases(2) });
    expect(() => loadAndValidatePhases(session)).toThrow('2');
  });

  it('error message includes actual count when count is too high', () => {
    const session = makeSession({ extractedPhases: makePhases(10) });
    expect(() => loadAndValidatePhases(session)).toThrow('10');
  });
});
