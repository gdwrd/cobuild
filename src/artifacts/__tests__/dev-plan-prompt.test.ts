import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEV_PLAN_SYSTEM_PROMPT,
  buildDevPlanMessages,
  getDevPlanPromptMetadata,
  logDevPlanPromptMetadata,
} from '../dev-plan-prompt.js';
import type { Session, PlanPhase } from '../../session/session.js';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const SAMPLE_SPEC = `## Project Overview\nA todo app.\n\n## Functional Requirements\n- Add tasks\n\n## Acceptance Criteria\n- Tasks appear in list`;
const SAMPLE_ARCH = `## System Components\nFrontend + Backend.\n\n## Data Flow\nHTTP.\n\n## External Integrations\nNone.\n\n## Storage Choices\nPostgres.\n\n## Deployment and Runtime Model\nDocker.\n\n## Security Considerations\nJWT.\n\n## Failure Handling\nRetry.`;
const SAMPLE_PLAN = `## Phase 1: Foundation\n\n### Goal\nBootstrap.\n\n## Phase 2: Features\n\n### Goal\nBuild features.`;

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp/test',
    completed: false,
    stage: 'dev-plans',
    transcript: [],
    ...overrides,
  };
}

function makePhase(overrides: Partial<PlanPhase> = {}): PlanPhase {
  return {
    number: 1,
    title: 'Foundation',
    goal: 'Bootstrap the project.',
    scope: 'Directory structure and CI setup.',
    deliverables: 'Repo with passing CI.',
    dependencies: 'None.',
    acceptanceCriteria: 'CI passes on main branch.',
    ...overrides,
  };
}

describe('DEV_PLAN_SYSTEM_PROMPT', () => {
  it('requires Plan: title heading', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('# Plan:');
  });

  it('requires Overview section', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('## Overview');
  });

  it('requires Validation Commands section', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('## Validation Commands');
  });

  it('requires Task N: heading format', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('### Task N:');
  });

  it('requires checkbox items', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('- [ ]');
  });

  it('prohibits code snippets', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toMatch(/do not include code/i);
  });

  it('instructs to cover only the current phase', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('current phase');
  });

  it('instructs model to output only Markdown', () => {
    expect(DEV_PLAN_SYSTEM_PROMPT).toContain('Output only the Markdown document');
  });
});

describe('buildDevPlanMessages', () => {
  it('returns exactly two messages', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
      planArtifact: { content: SAMPLE_PLAN, filePath: '/tmp/plan.md', generated: true },
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages).toHaveLength(2);
  });

  it('first message is the system prompt', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(DEV_PLAN_SYSTEM_PROMPT);
  });

  it('second message is a user message', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].role).toBe('user');
  });

  it('user message includes spec content', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain(SAMPLE_SPEC);
  });

  it('user message includes architecture content', () => {
    const session = makeSession({
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain(SAMPLE_ARCH);
  });

  it('user message includes high-level plan content', () => {
    const session = makeSession({
      planArtifact: { content: SAMPLE_PLAN, filePath: '/tmp/plan.md', generated: true },
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain(SAMPLE_PLAN);
  });

  it('user message includes phase metadata', () => {
    const phase = makePhase({ number: 2, title: 'Auth Layer', goal: 'Implement authentication.' });
    const session = makeSession();
    const messages = buildDevPlanMessages(session, phase, []);
    expect(messages[1].content).toContain('Auth Layer');
    expect(messages[1].content).toContain('Implement authentication.');
  });

  it('user message includes generation instruction with phase number and title', () => {
    const phase = makePhase({ number: 3, title: 'API Layer' });
    const session = makeSession();
    const messages = buildDevPlanMessages(session, phase, []);
    expect(messages[1].content).toContain('Phase 3: API Layer');
  });

  it('user message includes previously generated dev plans', () => {
    const session = makeSession();
    const previousPlans = ['# Plan: Phase 1\n\nPhase 1 content.', '# Plan: Phase 2\n\nPhase 2 content.'];
    const messages = buildDevPlanMessages(session, makePhase({ number: 3 }), previousPlans);
    expect(messages[1].content).toContain('Phase 1 content.');
    expect(messages[1].content).toContain('Phase 2 content.');
  });

  it('omits previous plans section when no previous plans provided', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).not.toContain('previously generated phase plans');
  });

  it('includes previous plans section header when prior plans exist', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase({ number: 2 }), ['# Plan: Phase 1\ncontent']);
    expect(messages[1].content).toContain('previously generated phase plans');
  });

  it('uses clean context - only 2 messages, no interview transcript', () => {
    const session = makeSession({
      transcript: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `turn ${i}`,
        timestamp: '2024-01-01T00:00:00.000Z',
      })),
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages).toHaveLength(2);
  });

  it('does not include interview transcript content in messages', () => {
    const session = makeSession({
      transcript: [
        { role: 'user', content: 'SECRET_INTERVIEW_CONTENT', timestamp: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const messages = buildDevPlanMessages(session, makePhase(), []);
    const allContent = messages.map((m) => m.content).join('');
    expect(allContent).not.toContain('SECRET_INTERVIEW_CONTENT');
  });

  it('falls back to placeholder when spec is missing', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain('(no spec available)');
  });

  it('falls back to placeholder when architecture is missing', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain('(no architecture available)');
  });

  it('falls back to placeholder when high-level plan is missing', () => {
    const session = makeSession();
    const messages = buildDevPlanMessages(session, makePhase(), []);
    expect(messages[1].content).toContain('(no high-level plan available)');
  });
});

describe('getDevPlanPromptMetadata', () => {
  it('returns correct message count', () => {
    const session = makeSession();
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.messageCount).toBe(2);
  });

  it('returns correct phase number', () => {
    const session = makeSession();
    const phase = makePhase({ number: 4 });
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.phaseNumber).toBe(4);
  });

  it('returns correct previous dev plan count', () => {
    const session = makeSession();
    const phase = makePhase({ number: 3 });
    const previousPlans = ['plan1', 'plan2'];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.previousDevPlanCount).toBe(2);
  });

  it('returns spec length equal to spec content length', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.specLength).toBe(SAMPLE_SPEC.length);
  });

  it('returns arch length equal to architecture content length', () => {
    const session = makeSession({
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.archLength).toBe(SAMPLE_ARCH.length);
  });

  it('returns plan length equal to plan content length', () => {
    const session = makeSession({
      planArtifact: { content: SAMPLE_PLAN, filePath: '/tmp/plan.md', generated: true },
    });
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.planLength).toBe(SAMPLE_PLAN.length);
  });

  it('returns zero lengths when artifacts are missing', () => {
    const session = makeSession();
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.specLength).toBe(0);
    expect(meta.archLength).toBe(0);
    expect(meta.planLength).toBe(0);
  });

  it('estimates token count greater than zero', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    const meta = getDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(meta.estimatedTokens).toBeGreaterThan(0);
  });
});

describe('logDevPlanPromptMetadata', () => {
  it('logs prompt metadata via the logger', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const phase = makePhase({ number: 2 });
    const previousPlans = ['# Plan: Phase 1\nContent.'];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    logDevPlanPromptMetadata(session, phase, messages, previousPlans);
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('log message includes phase number', () => {
    const session = makeSession();
    const phase = makePhase({ number: 5 });
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    logDevPlanPromptMetadata(session, phase, messages, previousPlans);
    const logCall = mockLogger.info.mock.calls[0][0] as string;
    expect(logCall).toContain('phase 5');
  });

  it('log message includes session id', () => {
    const session = makeSession({ id: 'my-session-abc' });
    const phase = makePhase();
    const previousPlans: string[] = [];
    const messages = buildDevPlanMessages(session, phase, previousPlans);
    logDevPlanPromptMetadata(session, phase, messages, previousPlans);
    const logCall = mockLogger.info.mock.calls[0][0] as string;
    expect(logCall).toContain('my-session-abc');
  });
});
