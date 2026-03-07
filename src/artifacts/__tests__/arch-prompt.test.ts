import { describe, it, expect, vi } from 'vitest';
import {
  ARCH_SYSTEM_PROMPT,
  buildArchMessages,
  getArchPromptMetadata,
  logArchPromptMetadata,
} from '../arch-prompt.js';
import type { Session } from '../../session/session.js';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    workingDirectory: '/tmp/test',
    completed: false,
    stage: 'architecture',
    transcript: [],
    ...overrides,
  };
}

const SAMPLE_SPEC = `## Project Overview\nA todo app.\n\n## Functional Requirements\n- Add tasks\n\n## Acceptance Criteria\n- Tasks appear in list`;

describe('ARCH_SYSTEM_PROMPT', () => {
  it('contains all required section headings', () => {
    expect(ARCH_SYSTEM_PROMPT).toContain('## System Components');
    expect(ARCH_SYSTEM_PROMPT).toContain('## Data Flow');
    expect(ARCH_SYSTEM_PROMPT).toContain('## External Integrations');
    expect(ARCH_SYSTEM_PROMPT).toContain('## Storage Choices');
    expect(ARCH_SYSTEM_PROMPT).toContain('## Deployment and Runtime Model');
    expect(ARCH_SYSTEM_PROMPT).toContain('## Security Considerations');
    expect(ARCH_SYSTEM_PROMPT).toContain('## Failure Handling');
  });

  it('instructs model to output only Markdown', () => {
    expect(ARCH_SYSTEM_PROMPT).toContain('Output only the Markdown document');
  });
});

describe('buildArchMessages', () => {
  it('returns exactly two messages', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    expect(messages).toHaveLength(2);
  });

  it('first message is the system prompt', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(ARCH_SYSTEM_PROMPT);
  });

  it('second message is a user message containing the spec', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain(SAMPLE_SPEC);
  });

  it('user message includes write-architecture instruction', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    expect(messages[1].content).toContain('Please write the architecture document now.');
  });

  it('uses clean context (only 2 messages, no interview transcript)', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      transcript: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'assistant' : 'user') as 'assistant' | 'user',
        content: `turn ${i}`,
        timestamp: '2024-01-01T00:00:00.000Z',
      })),
    });
    const messages = buildArchMessages(session);
    // Must use clean context: system + 1 user, not interview messages
    expect(messages).toHaveLength(2);
  });

  it('does not include interview transcript content in messages', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
      transcript: [
        { role: 'user', content: 'SECRET_INTERVIEW_CONTENT', timestamp: '2024-01-01T00:00:00.000Z' },
      ],
    });
    const messages = buildArchMessages(session);
    const allContent = messages.map((m) => m.content).join('');
    expect(allContent).not.toContain('SECRET_INTERVIEW_CONTENT');
  });

  it('falls back to placeholder when spec is missing', () => {
    const session = makeSession();
    const messages = buildArchMessages(session);
    expect(messages[1].content).toContain('(no spec available)');
  });
});

describe('getArchPromptMetadata', () => {
  it('returns correct message count', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    const meta = getArchPromptMetadata(session, messages);
    expect(meta.messageCount).toBe(2);
  });

  it('returns spec length equal to spec content length', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    const meta = getArchPromptMetadata(session, messages);
    expect(meta.specLength).toBe(SAMPLE_SPEC.length);
  });

  it('returns zero spec length when no spec artifact', () => {
    const session = makeSession();
    const messages = buildArchMessages(session);
    const meta = getArchPromptMetadata(session, messages);
    expect(meta.specLength).toBe(0);
  });

  it('estimates token count greater than zero', () => {
    const session = makeSession({ specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true } });
    const messages = buildArchMessages(session);
    const meta = getArchPromptMetadata(session, messages);
    expect(meta.estimatedTokens).toBeGreaterThan(0);
  });
});

describe('logArchPromptMetadata', () => {
  it('does not throw for a valid session and messages', () => {
    const session = makeSession({
      specArtifact: { content: SAMPLE_SPEC, filePath: '/tmp/spec.md', generated: true },
    });
    const messages = buildArchMessages(session);
    expect(() => logArchPromptMetadata(session, messages)).not.toThrow();
  });
});
