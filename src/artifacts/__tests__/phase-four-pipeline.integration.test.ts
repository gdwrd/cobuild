import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  persistErrorState: vi.fn(),
  persistWorkflowDecision: vi.fn((session, _stage, _decision) => ({ ...session, updatedAt: 'now' })),
  persistArchitectureArtifact: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
  completeArchitectureStage: vi.fn((session) => ({ ...session, stage: 'plan', updatedAt: 'now' })),
  persistPlanArtifact: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
  completePlanStage: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
  persistExtractedPhases: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
}));

import {
  saveSession,
  persistWorkflowDecision,
  persistArchitectureArtifact,
  completeArchitectureStage,
  persistPlanArtifact,
  completePlanStage,
  persistExtractedPhases,
} from '../../session/session.js';
import { ArchGenerator } from '../arch-generator.js';
import { PlanGenerator } from '../plan-generator.js';
import { validateArchStructure, assertValidArch, ArchValidationError } from '../arch-validator.js';
import { validatePlanStructure, assertValidPlan, PlanValidationError } from '../plan-validator.js';
import { extractPhases } from '../plan-parser.js';
import {
  generateArchitectureFilename,
  generatePlanFilename,
  resolveOutputPath,
  writeArtifactFile,
} from '../file-output.js';
import { runPostSpecWorkflow } from '../workflow-controller.js';
import { RetryExhaustedError, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';
import type { PostSpecWorkflowOptions } from '../workflow-controller.js';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const VALID_ARCH = `# Architecture

## System Components

Web server, database, cache layer.

## Data Flow

Client → API → Database → Response.

## External Integrations

None for MVP.

## Storage Choices

PostgreSQL for relational data.

## Deployment and Runtime Model

Docker containers on Kubernetes.

## Security Considerations

TLS everywhere, JWT auth tokens.

## Failure Handling

Retry with exponential backoff.
`;

const VALID_PLAN = `# High-Level Development Plan

## Phase 1: Foundation

### Goal
Establish project skeleton and toolchain.

### Scope
Repository setup, CI/CD, and core dependencies.

### Deliverables
Working build and test pipeline.

### Dependencies
None.

### Acceptance Criteria
All automated checks pass on first commit.

## Phase 2: Core Data Layer

### Goal
Implement persistence and data models.

### Scope
Database schema, ORM setup, migrations.

### Deliverables
Functional data layer with CRUD operations.

### Dependencies
Phase 1.

### Acceptance Criteria
Integration tests for all data models pass.

## Phase 3: API Layer

### Goal
Build RESTful API endpoints.

### Scope
Controllers, routing, request validation.

### Deliverables
Complete API surface with documented endpoints.

### Dependencies
Phase 2.

### Acceptance Criteria
All API tests pass and Postman collection verified.

## Phase 4: Frontend Integration

### Goal
Connect UI to the API and ship MVP.

### Scope
React components, state management, authentication flow.

### Deliverables
Deployable MVP with end-to-end user flow.

### Dependencies
Phase 3.

### Acceptance Criteria
End-to-end tests pass and product owner sign-off received.
`;

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'phase-four-integration-sess',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/tmp/test-project',
  completed: true,
  stage: 'spec',
  transcript: [],
  specArtifact: {
    content: '# Spec\n\n## Project Overview\n\nA test project.\n\n## Functional Requirements\n\n- Feature A\n\n## Acceptance Criteria\n\n- Tests pass.',
    filePath: '/tmp/test-project/docs/test-spec.md',
    generated: true,
  },
  ...overrides,
});

const makeProvider = (response: string): ModelProvider => ({
  generate: vi.fn(async () => response),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(persistWorkflowDecision).mockImplementation((session, _stage, _decision) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(persistArchitectureArtifact).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(completeArchitectureStage).mockImplementation((session) => ({
    ...session,
    stage: 'plan' as const,
    updatedAt: 'now',
  }));
  vi.mocked(persistPlanArtifact).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(completePlanStage).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
  vi.mocked(persistExtractedPhases).mockImplementation((session) => ({
    ...session,
    updatedAt: 'now',
  }));
});

// ─── architecture generation after spec ───────────────────────────────────────

describe('architecture generation after spec', () => {
  it('generates an architecture artifact with type architecture from a valid provider response', async () => {
    const session = makeSession({ stage: 'architecture' });
    const provider = makeProvider(VALID_ARCH);
    const generator = new ArchGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('architecture');
    expect(result.content).toBe(VALID_ARCH.trim());
  });

  it('increments architecture generation attempts in session', async () => {
    const session = makeSession({ stage: 'architecture', architectureGenerationAttempts: 0 });
    const provider = makeProvider(VALID_ARCH);
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    const savedCalls = vi.mocked(saveSession).mock.calls;
    const savedSessions = savedCalls.map((c) => c[0] as Session);
    const withAttempts = savedSessions.find((s) => (s.architectureGenerationAttempts ?? 0) > 0);
    expect(withAttempts).toBeDefined();
    expect(withAttempts!.architectureGenerationAttempts).toBe(1);
  });

  it('passes spec content to the provider via user message', async () => {
    const session = makeSession({
      stage: 'architecture',
      specArtifact: {
        content: 'My specific spec content',
        filePath: '/docs/spec.md',
        generated: true,
      },
    });
    const provider = makeProvider(VALID_ARCH);
    const generator = new ArchGenerator();

    await generator.generate(session, provider);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('My specific spec content');
  });

  it('throws RetryExhaustedError when provider consistently fails', async () => {
    vi.useFakeTimers();
    const session = makeSession({ stage: 'architecture' });
    const provider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const generator = new ArchGenerator();

    const promise = generator.generate(session, provider);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    vi.useRealTimers();
  });
});

// ─── immediate exit when user answers "no" ───────────────────────────────────

describe('immediate exit when user answers no', () => {
  const makeWorkflowOptions = (overrides: Partial<PostSpecWorkflowOptions> = {}): PostSpecWorkflowOptions => ({
    architectureGenerator: { generate: vi.fn(async () => ({ type: 'architecture' as const, content: VALID_ARCH })) },
    planGenerator: { generate: vi.fn(async () => ({ type: 'plan' as const, content: VALID_PLAN })) },
    onDecision: vi.fn(async () => true),
    writeArtifactFile: vi.fn((_content, _dir, type) => `/docs/${type}.md`),
    ...overrides,
  });

  it('terminates at architecture-decision when user declines and does not generate architecture', async () => {
    const session = makeSession();
    const provider = makeProvider(VALID_ARCH);
    const options = makeWorkflowOptions({ onDecision: vi.fn(async () => false) });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBe('architecture-decision');
    expect(result.architectureFilePath).toBeUndefined();
    expect(result.planFilePath).toBeUndefined();
    expect(vi.mocked(options.architectureGenerator.generate)).not.toHaveBeenCalled();
  });

  it('terminates at plan-decision when user accepts architecture but declines plan', async () => {
    const session = makeSession();
    const provider = makeProvider(VALID_ARCH);
    let callCount = 0;
    const onDecision = vi.fn(async () => {
      callCount++;
      return callCount === 1; // yes to arch, no to plan
    });
    const options = makeWorkflowOptions({ onDecision });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBe('plan-decision');
    expect(result.architectureFilePath).toBeDefined();
    expect(result.planFilePath).toBeUndefined();
    expect(vi.mocked(options.planGenerator.generate)).not.toHaveBeenCalled();
  });

  it('does not call architecture generator more than once when user declines at architecture step', async () => {
    const session = makeSession();
    const provider = makeProvider(VALID_ARCH);
    const options = makeWorkflowOptions({ onDecision: vi.fn(async () => false) });

    await runPostSpecWorkflow(session, provider, options);

    expect(vi.mocked(options.architectureGenerator.generate)).not.toHaveBeenCalled();
    expect(vi.mocked(options.planGenerator.generate)).not.toHaveBeenCalled();
    expect(vi.mocked(options.writeArtifactFile)).not.toHaveBeenCalled();
  });

  it('completes full pipeline when user accepts both decisions', async () => {
    const session = makeSession();
    const provider = makeProvider(VALID_ARCH);
    const options = makeWorkflowOptions({ onDecision: vi.fn(async () => true) });

    const result = await runPostSpecWorkflow(session, provider, options);

    expect(result.terminatedAt).toBeUndefined();
    expect(result.architectureFilePath).toBeDefined();
    expect(result.planFilePath).toBeDefined();
  });
});

// ─── high-level plan generation after architecture ───────────────────────────

describe('high-level plan generation after architecture', () => {
  const archArtifact = {
    content: VALID_ARCH,
    filePath: '/docs/test-architecture.md',
    generated: true,
  };

  it('generates a plan artifact with type plan from a valid provider response', async () => {
    const session = makeSession({ stage: 'plan', architectureArtifact: archArtifact });
    const provider = makeProvider(VALID_PLAN);
    const generator = new PlanGenerator();

    const result = await generator.generate(session, provider);

    expect(result.type).toBe('plan');
    expect(result.content).toBe(VALID_PLAN.trim());
  });

  it('increments plan generation attempts in session', async () => {
    const session = makeSession({ stage: 'plan', architectureArtifact: archArtifact, planGenerationAttempts: 0 });
    const provider = makeProvider(VALID_PLAN);
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    const savedCalls = vi.mocked(saveSession).mock.calls;
    const savedSessions = savedCalls.map((c) => c[0] as Session);
    const withAttempts = savedSessions.find((s) => (s.planGenerationAttempts ?? 0) > 0);
    expect(withAttempts).toBeDefined();
    expect(withAttempts!.planGenerationAttempts).toBe(1);
  });

  it('passes both spec and architecture content to the provider', async () => {
    const session = makeSession({
      stage: 'plan',
      specArtifact: { content: 'Specific spec text', filePath: '/docs/spec.md', generated: true },
      architectureArtifact: { content: 'Specific arch text', filePath: '/docs/arch.md', generated: true },
    });
    const provider = makeProvider(VALID_PLAN);
    const generator = new PlanGenerator();

    await generator.generate(session, provider);

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Specific spec text');
    expect(userMessage?.content).toContain('Specific arch text');
  });

  it('throws RetryExhaustedError when provider consistently fails', async () => {
    vi.useFakeTimers();
    const session = makeSession({ stage: 'plan', architectureArtifact: archArtifact });
    const provider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('connection reset')),
    };
    const generator = new PlanGenerator();

    const promise = generator.generate(session, provider);
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    vi.useRealTimers();
  });
});

// ─── plan validator rejects invalid outputs ───────────────────────────────────

describe('plan validator rejects invalid outputs', () => {
  it('rejects a plan with fewer than 4 phases', () => {
    const tooFewPhases = `## Phase 1: Setup\n\n### Goal\nSet up.\n\n### Scope\nBasic setup.\n\n### Deliverables\nDone.\n\n### Dependencies\nNone.\n\n### Acceptance Criteria\nPasses.\n\n## Phase 2: Core\n\n### Goal\nCore.\n\n### Scope\nCore stuff.\n\n### Deliverables\nDone.\n\n### Dependencies\nPhase 1.\n\n### Acceptance Criteria\nPasses.\n`;

    const result = validatePlanStructure(tooFewPhases);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('phases'))).toBe(true);
  });

  it('rejects a plan with more than 8 phases', () => {
    const makePhase = (n: number) =>
      `## Phase ${n}: Phase ${n}\n\n### Goal\nGoal.\n\n### Scope\nScope.\n\n### Deliverables\nDeliverables.\n\n### Dependencies\n${n === 1 ? 'None.' : `Phase ${n - 1}.`}\n\n### Acceptance Criteria\nCriteria.\n\n`;
    const ninePhases = Array.from({ length: 9 }, (_, i) => makePhase(i + 1)).join('');

    const result = validatePlanStructure(ninePhases);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('phases'))).toBe(true);
  });

  it('rejects a plan with non-sequential phase numbering', () => {
    const nonSequential = `## Phase 1: First\n\n### Goal\nG.\n\n### Scope\nS.\n\n### Deliverables\nD.\n\n### Dependencies\nNone.\n\n### Acceptance Criteria\nC.\n\n## Phase 3: Third\n\n### Goal\nG.\n\n### Scope\nS.\n\n### Deliverables\nD.\n\n### Dependencies\nPhase 1.\n\n### Acceptance Criteria\nC.\n\n## Phase 4: Fourth\n\n### Goal\nG.\n\n### Scope\nS.\n\n### Deliverables\nD.\n\n### Dependencies\nPhase 3.\n\n### Acceptance Criteria\nC.\n\n## Phase 5: Fifth\n\n### Goal\nG.\n\n### Scope\nS.\n\n### Deliverables\nD.\n\n### Dependencies\nPhase 4.\n\n### Acceptance Criteria\nC.\n`;

    const result = validatePlanStructure(nonSequential);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sequential'))).toBe(true);
  });

  it('rejects a plan where a phase is missing required fields', () => {
    const missingFields = `## Phase 1: Setup\n\n### Goal\nSet up.\n\n## Phase 2: Core\n\n### Goal\nCore.\n\n## Phase 3: API\n\n### Goal\nAPI.\n\n## Phase 4: Frontend\n\n### Goal\nFrontend.\n`;

    const result = validatePlanStructure(missingFields);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required fields'))).toBe(true);
  });

  it('assertValidPlan throws PlanValidationError for invalid content', () => {
    expect(() => assertValidPlan('No phases here at all.')).toThrow(PlanValidationError);
  });

  it('PlanValidationError message describes the validation failure', () => {
    try {
      assertValidPlan('Just some text without any phases.');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanValidationError);
      expect((err as PlanValidationError).message).toMatch(/Plan validation failed/);
    }
  });

  it('validatePlanStructure returns valid=true for a correct 4-phase plan', () => {
    const result = validatePlanStructure(VALID_PLAN);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── arch validator rejects invalid outputs ───────────────────────────────────

describe('arch validator rejects invalid outputs', () => {
  it('rejects architecture missing system components', () => {
    const noComponents = VALID_ARCH.replace(/## System Components[\s\S]*?## Data Flow/, '## Data Flow');
    const result = validateArchStructure(noComponents);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('system components');
  });

  it('rejects architecture missing security considerations', () => {
    const noSecurity = VALID_ARCH.replace(/## Security Considerations[\s\S]*?## Failure Handling/, '## Failure Handling');
    const result = validateArchStructure(noSecurity);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('security considerations');
  });

  it('assertValidArch throws ArchValidationError for invalid content', () => {
    expect(() => assertValidArch('# Architecture\n\nNo sections here.')).toThrow(ArchValidationError);
  });

  it('ArchValidationError lists all missing sections', () => {
    try {
      assertValidArch('# Architecture\n\nEmpty document.');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchValidationError);
      const archErr = err as ArchValidationError;
      expect(archErr.result.missingSections.length).toBeGreaterThan(0);
    }
  });

  it('validateArchStructure returns valid=true for correct architecture', () => {
    const result = validateArchStructure(VALID_ARCH);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toHaveLength(0);
  });
});

// ─── phase extraction logic ───────────────────────────────────────────────────

describe('phase extraction logic', () => {
  it('extracts the correct number of phases from a valid plan', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases).toHaveLength(4);
  });

  it('extracts phase numbers and titles correctly', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].number).toBe(1);
    expect(phases[0].title).toBe('Foundation');
    expect(phases[1].number).toBe(2);
    expect(phases[1].title).toBe('Core Data Layer');
    expect(phases[3].number).toBe(4);
    expect(phases[3].title).toBe('Frontend Integration');
  });

  it('extracts goal field from each phase', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].goal).toContain('project skeleton');
    expect(phases[1].goal).toContain('persistence');
  });

  it('extracts scope field from each phase', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].scope).toContain('Repository setup');
    expect(phases[2].scope).toContain('Controllers');
  });

  it('extracts deliverables from each phase', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].deliverables).toContain('build and test pipeline');
  });

  it('extracts dependencies from each phase', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].dependencies).toContain('None');
    expect(phases[1].dependencies).toContain('Phase 1');
  });

  it('extracts acceptance criteria from each phase', () => {
    const phases = extractPhases(VALID_PLAN);
    expect(phases[0].acceptanceCriteria).toContain('automated checks pass');
  });

  it('returns an empty array for content with no phases', () => {
    const phases = extractPhases('# No phases here\n\nJust some text.');
    expect(phases).toHaveLength(0);
  });

  it('each extracted phase contains all required fields', () => {
    const phases = extractPhases(VALID_PLAN);
    for (const phase of phases) {
      expect(typeof phase.number).toBe('number');
      expect(typeof phase.title).toBe('string');
      expect(typeof phase.goal).toBe('string');
      expect(typeof phase.scope).toBe('string');
      expect(typeof phase.deliverables).toBe('string');
      expect(typeof phase.dependencies).toBe('string');
      expect(typeof phase.acceptanceCriteria).toBe('string');
    }
  });
});

// ─── filename collision handling for architecture and plan files ───────────────

describe('filename collision handling for architecture and plan files', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('generateArchitectureFilename produces the expected pattern', () => {
    expect(generateArchitectureFilename('My Project')).toBe('my-project-architecture.md');
  });

  it('generatePlanFilename produces the expected pattern', () => {
    expect(generatePlanFilename('My Project')).toBe('my-project-high-level-plan.md');
  });

  it('generateArchitectureFilename sanitizes unsafe characters', () => {
    const filename = generateArchitectureFilename('Project: Alpha/Beta');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('/');
    expect(filename).toMatch(/\.md$/);
  });

  it('generatePlanFilename sanitizes unsafe characters', () => {
    const filename = generatePlanFilename('Project: Alpha/Beta');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('/');
    expect(filename).toMatch(/\.md$/);
  });

  it('resolveOutputPath returns collision-free path for architecture file when original exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-arch-'));
    try {
      const filename = generateArchitectureFilename('Test Project');
      fs.writeFileSync(path.join(tmpDir, filename), 'existing content');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, 'test-project-architecture-2.md'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('resolveOutputPath returns collision-free path for plan file when original exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-plan-'));
    try {
      const filename = generatePlanFilename('Test Project');
      fs.writeFileSync(path.join(tmpDir, filename), 'existing content');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, 'test-project-high-level-plan-2.md'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('increments suffix past -2 when both architecture and -2 exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-arch-'));
    try {
      const filename = generateArchitectureFilename('Test Project');
      fs.writeFileSync(path.join(tmpDir, filename), 'v1');
      fs.writeFileSync(path.join(tmpDir, 'test-project-architecture-2.md'), 'v2');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, 'test-project-architecture-3.md'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('returns plain path for architecture file when no collision exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-arch-'));
    try {
      const filename = generateArchitectureFilename('Unique Project');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, filename));
      expect(fs.existsSync(resolved)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writeArtifactFile writes architecture content correctly to a real path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-arch-'));
    try {
      const filePath = path.join(tmpDir, generateArchitectureFilename('Integration Test'));
      writeArtifactFile(filePath, VALID_ARCH);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(VALID_ARCH);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writeArtifactFile writes plan content correctly to a real path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-plan-'));
    try {
      const filePath = path.join(tmpDir, generatePlanFilename('Integration Test'));
      writeArtifactFile(filePath, VALID_PLAN);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(VALID_PLAN);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
