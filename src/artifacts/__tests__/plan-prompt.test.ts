import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PLAN_SYSTEM_PROMPT,
  buildPlanMessages,
  getPlanPromptMetadata,
  logPlanPromptMetadata,
} from '../plan-prompt.js';
import type { Session } from '../../session/session.js';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp/test',
    completed: false,
    stage: 'plan',
    transcript: [],
    ...overrides,
  };
}

const SAMPLE_SPEC = `## Project Overview\nA todo app.\n\n## Functional Requirements\n- Add tasks\n\n## Acceptance Criteria\n- Tasks appear in list`;
const SAMPLE_ARCH = `## System Components\nFrontend + Backend.\n\n## Data Flow\nHTTP requests.\n\n## External Integrations\nNone.\n\n## Storage Choices\nPostgres.\n\n## Deployment and Runtime Model\nDocker.\n\n## Security Considerations\nJWT auth.\n\n## Failure Handling\nRetry logic.`;

describe('PLAN_SYSTEM_PROMPT', () => {
  it('mentions 4 to 8 phases', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('4 and 8');
  });

  it('requires Title field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Title');
  });

  it('requires Goal field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Goal');
  });

  it('requires Scope field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Scope');
  });

  it('requires Deliverables field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Deliverables');
  });

  it('requires Dependencies field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Dependencies');
  });

  it('requires Acceptance Criteria field in each phase', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Acceptance Criteria');
  });

  it('instructs model to output only Markdown', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('Output only the Markdown document');
  });
});

describe('buildPlanMessages', () => {
  it('returns exactly two messages', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages).toHaveLength(2);
  });

  it('first message is the system prompt', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(PLAN_SYSTEM_PROMPT);
  });

  it('second message is a user message containing the spec', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain(SAMPLE_SPEC);
  });

  it('second message contains the architecture document', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[1].content).toContain(SAMPLE_ARCH);
  });

  it('user message includes write-plan instruction', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[1].content).toContain('Please write the high-level development plan now.');
  });

  it('uses clean context (only 2 messages, no interview transcript)', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
      transcript: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `turn ${i}`,
        timestamp: '2024-01-01T00:00:00.000Z',
      })),
    });
    const messages = buildPlanMessages(session);
    expect(messages).toHaveLength(2);
  });

  it('does not include interview transcript content in messages', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
      transcript: [
        { role: 'user', content: 'SECRET_INTERVIEW_CONTENT', timestamp: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const messages = buildPlanMessages(session);
    const allContent = messages.map((m) => m.content).join('');
    expect(allContent).not.toContain('SECRET_INTERVIEW_CONTENT');
  });

  it('falls back to placeholder when spec is missing', () => {
    const session = makeSession({
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[1].content).toContain('(no spec available)');
  });

  it('falls back to placeholder when architecture is missing', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    expect(messages[1].content).toContain('(no architecture available)');
  });
});

describe('getPlanPromptMetadata', () => {
  it('returns correct message count', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    const meta = getPlanPromptMetadata(session, messages);
    expect(meta.messageCount).toBe(2);
  });

  it('returns spec length equal to spec content length', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    const meta = getPlanPromptMetadata(session, messages);
    expect(meta.specLength).toBe(SAMPLE_SPEC.length);
  });

  it('returns arch length equal to architecture content length', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    const meta = getPlanPromptMetadata(session, messages);
    expect(meta.archLength).toBe(SAMPLE_ARCH.length);
  });

  it('returns zero lengths when artifacts are missing', () => {
    const session = makeSession();
    const messages = buildPlanMessages(session);
    const meta = getPlanPromptMetadata(session, messages);
    expect(meta.specLength).toBe(0);
    expect(meta.archLength).toBe(0);
  });

  it('estimates token count greater than zero', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    const meta = getPlanPromptMetadata(session, messages);
    expect(meta.estimatedTokens).toBeGreaterThan(0);
  });
});

describe('logPlanPromptMetadata', () => {
  it('logs prompt metadata via the logger', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      architectureArtifact: { content: SAMPLE_ARCH, filePath: '/tmp/arch.md', generated: true },
    });
    const messages = buildPlanMessages(session);
    logPlanPromptMetadata(session, messages);
    expect(mockLogger.info).toHaveBeenCalled();
  });
});
