/**
 * Full artifact pipeline integration tests.
 *
 * Tests the complete sequence: spec → architecture → plan → dev plans.
 * Each stage uses the real generator and validator implementations,
 * with a mock provider and mocked session persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn((sessionId: string) => ({ id: sessionId, updatedAt: 'now' })),
  getTranscript: vi.fn(() => []),
  persistErrorState: vi.fn(),
  persistSpecArtifact: vi.fn((session, content, filePath) => ({
    ...session,
    specArtifact: { content, filePath, generated: true },
    updatedAt: 'now',
  })),
  completeSpecStage: vi.fn((session) => ({ ...session, stage: 'architecture', updatedAt: 'now' })),
  persistArchitectureArtifact: vi.fn((session, content, filePath) => ({
    ...session,
    architectureArtifact: { content, filePath, generated: true },
    updatedAt: 'now',
  })),
  completeArchitectureStage: vi.fn((session) => ({ ...session, stage: 'plan', updatedAt: 'now' })),
  persistPlanArtifact: vi.fn((session, content, filePath) => ({
    ...session,
    planArtifact: { content, filePath, generated: true },
    updatedAt: 'now',
  })),
  completePlanStage: vi.fn((session) => ({ ...session, updatedAt: 'now' })),
  persistExtractedPhases: vi.fn((session, phases) => ({
    ...session,
    extractedPhases: phases,
    updatedAt: 'now',
  })),
  persistDevPlansDecision: vi.fn((session, decision) => ({
    ...session,
    devPlansDecision: decision,
    updatedAt: 'now',
  })),
  persistCurrentDevPlanPhase: vi.fn((session, phaseNumber) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  })),
  persistDevPlanPhaseCompletion: vi.fn((session) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  })),
  persistDevPlanHalt: vi.fn((session, failedPhaseNumber) => ({
    ...session,
    devPlanHalted: true,
    currentDevPlanPhase: failedPhaseNumber,
    updatedAt: 'now',
  })),
  persistDevPlanStage: vi.fn((session) => ({
    ...session,
    stage: 'dev-plans',
    updatedAt: 'now',
  })),
  completeDevPlanStage: vi.fn((session) => ({
    ...session,
    devPlansComplete: true,
    updatedAt: 'now',
  })),
}));

import {
  saveSession,
  getTranscript,
  persistCurrentDevPlanPhase,
  persistDevPlanPhaseCompletion,
  persistDevPlanHalt,
  persistDevPlanStage,
  completeDevPlanStage,
} from '../../session/session.js';
import { SpecGenerator } from '../spec-generator.js';
import { ArchGenerator } from '../arch-generator.js';
import { PlanGenerator } from '../plan-generator.js';
import { runArtifactPipeline } from '../generator.js';
import { extractPhases } from '../plan-parser.js';
import { runDevPlanLoop } from '../dev-plan-loop.js';
import {
  generateFilename,
  generateArchitectureFilename,
  generatePlanFilename,
  resolveOutputPath,
  writeArtifactFile,
  ensureDocsDir,
} from '../file-output.js';
import { RetryExhaustedError, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import type { Session, PlanPhase } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const VALID_SPEC = `# My Full Pipeline Test Project

## Project Overview

A comprehensive test project that validates the complete artifact pipeline.

## Functional Requirements

- Requirement A: spec generation from interview transcript
- Requirement B: architecture design from spec
- Requirement C: implementation plan from architecture
- Requirement D: per-phase dev plans from high-level plan

## Acceptance Criteria

- All artifacts are generated and persisted
- Each stage validates content before advancing
- Session tracks progress through all stages
`;

const VALID_ARCH = `# My Full Pipeline Test Project Architecture

## System Components

- CLI entrypoint: commander-based CLI
- Interview Engine: multi-turn conversation loop
- Artifact Pipeline: sequential generator chain
- Session Store: JSON files in ~/.cobuild/sessions/

## Data Flow

User input → Interview Engine → Transcript → Artifact Pipeline → Docs

## External Integrations

- Ollama: local LLM provider via /api/chat
- Filesystem: docs/ for output, ~/.cobuild/ for state

## Storage Choices

- Sessions: atomic JSON write (tmp+rename)
- Artifacts: Markdown files in docs/

## Deployment and Runtime Model

Single-user CLI, Node.js process, Ink terminal UI.

## Security Considerations

- No network egress beyond localhost
- Session files mode 0o600

## Failure Handling

- Retry up to 5 times per generator
- Atomic writes prevent corrupt artifacts
`;

const VALID_PLAN = `# My Full Pipeline Test Project High-Level Plan

## Phase 1: Foundation

### Goal
Establish the project skeleton with CLI and dependencies.

### Scope
Package setup, TypeScript configuration, CLI entrypoint.

### Deliverables
Working build pipeline and CLI stub.

### Dependencies
None.

### Acceptance Criteria
npm run build completes without errors.

## Phase 2: Core Data Layer

### Goal
Implement session persistence and interview transcript storage.

### Scope
Session schema, UUID generation, atomic writes.

### Deliverables
createSession, saveSession, loadSession, findLatestByWorkingDirectory.

### Dependencies
Phase 1.

### Acceptance Criteria
Sessions written atomically and readable on resume.

## Phase 3: Interview Engine

### Goal
Implement multi-turn interview loop with COMPLETION_MARKER detection.

### Scope
Controller loop, transcript persistence, Ollama integration.

### Deliverables
Interview controller, Ollama provider, transcript append.

### Dependencies
Phase 2.

### Acceptance Criteria
Interview runs to completion and persists transcript.

## Phase 4: Artifact Pipeline

### Goal
Generate spec, architecture, and plan documents from interview transcript.

### Scope
Spec generator, architecture generator, plan generator, validators, file output.

### Deliverables
All three artifacts written to docs/ with collision handling.

### Dependencies
Phase 3.

### Acceptance Criteria
All validators pass and files appear in docs/.
`;

const makeValidDevPlan = (phaseNumber: number): string =>
  `# Plan: Phase ${phaseNumber} – Full Pipeline Test

## Overview

This is the dev plan for phase ${phaseNumber} of the full pipeline integration test.

## Validation Commands

- npm run build
- npm test

### Task 1: Implement Phase ${phaseNumber} Core

- [ ] Create module structure for phase ${phaseNumber}
- [ ] Implement primary components
- [ ] Add unit tests

### Task 2: Integration

- [ ] Wire up to previous phase outputs
- [ ] Verify end-to-end behavior
`;

const makePhase = (number: number, title: string): PlanPhase => ({
  number,
  title,
  goal: `Goal for phase ${number}`,
  scope: `Scope for phase ${number}`,
  deliverables: `Deliverables for phase ${number}`,
  dependencies: number === 1 ? 'None' : `Phase ${number - 1}`,
  acceptanceCriteria: `Acceptance criteria for phase ${number}`,
});

const BASE_SESSION: Session = {
  id: 'full-pipeline-integration-test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/tmp/full-pipeline-test',
  completed: true,
  stage: 'spec',
  transcript: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTranscript).mockReturnValue([]);
  vi.mocked(persistCurrentDevPlanPhase).mockImplementation((session, phaseNumber) => ({
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanPhaseCompletion).mockImplementation((session) => ({
    ...session,
    completedPhaseCount: (session.completedPhaseCount ?? 0) + 1,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanHalt).mockImplementation((session, failedPhaseNumber) => ({
    ...session,
    devPlanHalted: true,
    currentDevPlanPhase: failedPhaseNumber,
    updatedAt: 'now',
  }));
  vi.mocked(persistDevPlanStage).mockImplementation((session) => ({
    ...session,
    stage: 'dev-plans' as const,
    updatedAt: 'now',
  }));
  vi.mocked(completeDevPlanStage).mockImplementation((session) => ({
    ...session,
    devPlansComplete: true,
    updatedAt: 'now',
  }));
});

// ─── spec stage ───────────────────────────────────────────────────────────────

describe('spec stage', () => {
  it('generates a valid spec artifact from interview transcript', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_SPEC) };
    const { result } = await runArtifactPipeline(BASE_SESSION, provider, new SpecGenerator(), 'spec');

    expect(result.type).toBe('spec');
    expect(result.content).toContain('Project Overview');
    expect(result.content).toContain('Functional Requirements');
    expect(result.content).toContain('Acceptance Criteria');
  });

  it('writes spec file to docs/ with the correct filename pattern', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-full-spec-'));
    try {
      const docsDir = ensureDocsDir(tmpDir);
      const filename = generateFilename('My Full Pipeline Test Project');

      expect(filename).toMatch(/^my-full-pipeline-test-project-spec\.md$/);

      const outputPath = resolveOutputPath(docsDir, filename);
      writeArtifactFile(outputPath, VALID_SPEC);

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.readFileSync(outputPath, 'utf8')).toBe(VALID_SPEC);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('persists session on spec generation', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_SPEC) };
    await runArtifactPipeline(BASE_SESSION, provider, new SpecGenerator(), 'spec');

    expect(vi.mocked(saveSession)).toHaveBeenCalled();
  });
});

// ─── architecture stage ───────────────────────────────────────────────────────

describe('architecture stage', () => {
  const archSession: Session = {
    ...BASE_SESSION,
    stage: 'architecture',
    specArtifact: { content: VALID_SPEC.trim(), filePath: '/docs/spec.md', generated: true },
  };

  it('generates a valid architecture artifact', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_ARCH) };
    const { result } = await runArtifactPipeline(archSession, provider, new ArchGenerator(), 'architecture');

    expect(result.type).toBe('architecture');
    expect(result.content).toContain('System Components');
    expect(result.content).toContain('Data Flow');
    expect(result.content).toContain('External Integrations');
    expect(result.content).toContain('Security Considerations');
    expect(result.content).toContain('Failure Handling');
  });

  it('writes architecture file with the correct filename pattern', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-full-arch-'));
    try {
      const docsDir = ensureDocsDir(tmpDir);
      const filename = generateArchitectureFilename('My Full Pipeline Test Project');

      expect(filename).toMatch(/^my-full-pipeline-test-project-architecture\.md$/);

      const outputPath = resolveOutputPath(docsDir, filename);
      writeArtifactFile(outputPath, VALID_ARCH);

      expect(fs.existsSync(outputPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes spec content in the architecture generation prompt', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_ARCH) };
    await runArtifactPipeline(archSession, provider, new ArchGenerator(), 'architecture');

    const [messages] = vi.mocked(provider.generate).mock.calls[0];
    const userMessage = messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage?.content).toContain(VALID_SPEC.trim());
  });
});

// ─── plan stage ───────────────────────────────────────────────────────────────

describe('plan stage', () => {
  const planSession: Session = {
    ...BASE_SESSION,
    stage: 'plan',
    specArtifact: { content: VALID_SPEC.trim(), filePath: '/docs/spec.md', generated: true },
    architectureArtifact: { content: VALID_ARCH.trim(), filePath: '/docs/arch.md', generated: true },
  };

  it('generates a valid plan artifact with 4 phases', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_PLAN) };
    const { result } = await runArtifactPipeline(planSession, provider, new PlanGenerator(), 'plan');

    expect(result.type).toBe('plan');
    const phases = extractPhases(result.content);
    expect(phases).toHaveLength(4);
  });

  it('writes plan file with the correct filename pattern', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-full-plan-'));
    try {
      const docsDir = ensureDocsDir(tmpDir);
      const filename = generatePlanFilename('My Full Pipeline Test Project');

      expect(filename).toMatch(/^my-full-pipeline-test-project-high-level-plan\.md$/);

      const outputPath = resolveOutputPath(docsDir, filename);
      writeArtifactFile(outputPath, VALID_PLAN);

      expect(fs.existsSync(outputPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('extracts phases with all required fields', async () => {
    const provider: ModelProvider = { generate: vi.fn(async () => VALID_PLAN) };
    const { result } = await runArtifactPipeline(planSession, provider, new PlanGenerator(), 'plan');

    const phases = extractPhases(result.content);
    for (const phase of phases) {
      expect(typeof phase.number).toBe('number');
      expect(typeof phase.title).toBe('string');
      expect(phase.title.length).toBeGreaterThan(0);
      expect(typeof phase.goal).toBe('string');
      expect(phase.goal.length).toBeGreaterThan(0);
      expect(typeof phase.scope).toBe('string');
      expect(phase.scope.length).toBeGreaterThan(0);
      expect(typeof phase.deliverables).toBe('string');
      expect(typeof phase.dependencies).toBe('string');
      expect(typeof phase.acceptanceCriteria).toBe('string');
    }
  });
});

// ─── dev plan stage ───────────────────────────────────────────────────────────

describe('dev plan stage', () => {
  let tmpDir: string;

  const phases: PlanPhase[] = [
    makePhase(1, 'Foundation'),
    makePhase(2, 'Core Data Layer'),
    makePhase(3, 'Interview Engine'),
    makePhase(4, 'Artifact Pipeline'),
  ];

  const devPlanSession: Session = {
    ...BASE_SESSION,
    stage: 'plan',
    specArtifact: { content: VALID_SPEC.trim(), filePath: '/docs/spec.md', generated: true },
    architectureArtifact: { content: VALID_ARCH.trim(), filePath: '/docs/arch.md', generated: true },
    planArtifact: { content: VALID_PLAN.trim(), filePath: '/docs/plan.md', generated: true },
    extractedPhases: phases,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-full-devplan-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('generates dev plans for all 4 phases in sequence', async () => {
    const session: Session = { ...devPlanSession, workingDirectory: tmpDir };
    let callIndex = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => makeValidDevPlan(++callIndex)),
    };
    const onPhaseComplete = vi.fn();

    const result = await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete,
    });

    expect(onPhaseComplete).toHaveBeenCalledTimes(4);
    expect(result.devPlansComplete).toBe(true);
  });

  it('creates dev plan files in docs/plans/ directory', async () => {
    const session: Session = { ...devPlanSession, workingDirectory: tmpDir };
    let callIndex = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => makeValidDevPlan(++callIndex)),
    };
    const filePaths: string[] = [];

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: (_, filePath) => filePaths.push(filePath),
    });

    expect(filePaths).toHaveLength(4);
    for (const filePath of filePaths) {
      expect(filePath).toContain(path.join('docs', 'plans'));
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  it('passes accumulated prior phase content to each subsequent generator call', async () => {
    const session: Session = { ...devPlanSession, workingDirectory: tmpDir };
    let callIndex = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => makeValidDevPlan(++callIndex)),
    };

    await runDevPlanLoop(session, provider, {
      onPhaseStart: vi.fn(),
      onPhaseComplete: vi.fn(),
    });

    // Phase 4 call should include content from phases 1, 2, and 3
    const phase4Messages = vi.mocked(provider.generate).mock.calls[3][0];
    const phase4User = phase4Messages.find((m: { role: string }) => m.role === 'user');
    expect(phase4User?.content).toContain('Phase 1');
    expect(phase4User?.content).toContain('Phase 2');
    expect(phase4User?.content).toContain('Phase 3');
  });
});

// ─── full pipeline: spec → architecture → plan ────────────────────────────────

describe('full pipeline: spec through plan in sequence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-full-chain-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('chains spec, architecture, and plan generators producing valid artifacts for all stages', async () => {
    const docsDir = ensureDocsDir(tmpDir);
    const session: Session = { ...BASE_SESSION, workingDirectory: tmpDir };

    // Stage 1: Spec
    const specProvider: ModelProvider = { generate: vi.fn(async () => VALID_SPEC) };
    const { result: specResult, session: specSession } = await runArtifactPipeline(
      session,
      specProvider,
      new SpecGenerator(),
      'spec',
    );
    expect(specResult.type).toBe('spec');
    const specFile = resolveOutputPath(docsDir, generateFilename(path.basename(tmpDir)));
    writeArtifactFile(specFile, specResult.content);
    expect(fs.existsSync(specFile)).toBe(true);

    // Stage 2: Architecture
    const archSession: Session = {
      ...specSession,
      stage: 'architecture',
      specArtifact: { content: specResult.content, filePath: specFile, generated: true },
    };
    const archProvider: ModelProvider = { generate: vi.fn(async () => VALID_ARCH) };
    const { result: archResult, session: postArchSession } = await runArtifactPipeline(
      archSession,
      archProvider,
      new ArchGenerator(),
      'architecture',
    );
    expect(archResult.type).toBe('architecture');
    const archFile = resolveOutputPath(docsDir, generateArchitectureFilename(path.basename(tmpDir)));
    writeArtifactFile(archFile, archResult.content);
    expect(fs.existsSync(archFile)).toBe(true);

    // Stage 3: Plan
    const planSession: Session = {
      ...postArchSession,
      stage: 'plan',
      architectureArtifact: { content: archResult.content, filePath: archFile, generated: true },
    };
    const planProvider: ModelProvider = { generate: vi.fn(async () => VALID_PLAN) };
    const { result: planResult } = await runArtifactPipeline(
      planSession,
      planProvider,
      new PlanGenerator(),
      'plan',
    );
    expect(planResult.type).toBe('plan');
    const planFile = resolveOutputPath(docsDir, generatePlanFilename(path.basename(tmpDir)));
    writeArtifactFile(planFile, planResult.content);
    expect(fs.existsSync(planFile)).toBe(true);

    // Verify phases extractable from plan
    const phases = extractPhases(planResult.content);
    expect(phases.length).toBeGreaterThanOrEqual(4);

    // Verify all three artifact files exist in docs/
    const docFiles = fs.readdirSync(docsDir);
    expect(docFiles.length).toBeGreaterThanOrEqual(3);
  });

  it('each stage result feeds into the next with correct artifact content', async () => {
    const session: Session = { ...BASE_SESSION, workingDirectory: tmpDir };

    const specProvider: ModelProvider = { generate: vi.fn(async () => VALID_SPEC) };
    const { result: specResult, session: specSession } = await runArtifactPipeline(
      session,
      specProvider,
      new SpecGenerator(),
      'spec',
    );

    const archSession: Session = {
      ...specSession,
      stage: 'architecture',
      specArtifact: { content: specResult.content, filePath: '/docs/spec.md', generated: true },
    };
    const archProvider: ModelProvider = { generate: vi.fn(async () => VALID_ARCH) };
    await runArtifactPipeline(archSession, archProvider, new ArchGenerator(), 'architecture');

    // The arch generator should have received spec content in its prompt
    const [archMessages] = vi.mocked(archProvider.generate).mock.calls[0];
    const archUser = archMessages.find((m: { role: string }) => m.role === 'user');
    expect(archUser?.content).toContain('Project Overview');
  });
});

// ─── retry exhaustion in full pipeline context ────────────────────────────────

describe('retry exhaustion in full pipeline context', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws RetryExhaustedError when spec generator fails all retries', async () => {
    vi.useFakeTimers();
    const provider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const promise = runArtifactPipeline(BASE_SESSION, provider, new SpecGenerator(), 'spec');
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('throws RetryExhaustedError when architecture generator fails all retries', async () => {
    vi.useFakeTimers();
    const archSession: Session = {
      ...BASE_SESSION,
      stage: 'architecture',
      specArtifact: { content: VALID_SPEC.trim(), filePath: '/docs/spec.md', generated: true },
    };
    const provider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const promise = runArtifactPipeline(archSession, provider, new ArchGenerator(), 'architecture');
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('throws RetryExhaustedError when plan generator consistently returns invalid content', async () => {
    vi.useFakeTimers();
    const planSession: Session = {
      ...BASE_SESSION,
      stage: 'plan',
      specArtifact: { content: VALID_SPEC.trim(), filePath: '/docs/spec.md', generated: true },
      architectureArtifact: { content: VALID_ARCH.trim(), filePath: '/docs/arch.md', generated: true },
    };
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# Invalid plan with only one phase\n\n## Phase 1: Only\n\n### Goal\nBad.\n\n### Scope\nBad.\n\n### Deliverables\nBad.\n\n### Dependencies\nNone.\n\n### Acceptance Criteria\nBad.\n'),
    };
    const promise = runArtifactPipeline(planSession, provider, new PlanGenerator(), 'plan');
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
  });

  it('succeeds when provider recovers on a later attempt', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const provider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        if (callCount < 3) throw new Error('transient failure');
        return VALID_SPEC;
      }),
    };
    const promise = runArtifactPipeline(BASE_SESSION, provider, new SpecGenerator(), 'spec');
    await vi.runAllTimersAsync();

    const { result } = await promise;
    expect(result.type).toBe('spec');
    expect(callCount).toBe(3);
  });
});
