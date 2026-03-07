import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../session/session.js', () => ({
  saveSession: vi.fn(),
  getTranscript: vi.fn(() => []),
  persistErrorState: vi.fn(),
}));

import { saveSession, getTranscript } from '../../session/session.js';
import { SpecGenerator } from '../spec-generator.js';
import { runArtifactPipeline } from '../generator.js';
import { generateFilename, resolveOutputPath, writeArtifactFile } from '../file-output.js';
import { RetryExhaustedError, DEFAULT_MAX_ATTEMPTS } from '../../interview/retry.js';
import type { Session } from '../../session/session.js';
import type { ModelProvider } from '../../interview/controller.js';

const VALID_SPEC = `# Project Spec

## Project Overview

This is a test project that does something useful.

## Functional Requirements

- Feature A: core functionality
- Feature B: secondary functionality

## Acceptance Criteria

- All unit tests pass
- No regressions in existing functionality
`;

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'integration-sess-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  workingDirectory: '/tmp/test-project',
  completed: true,
  stage: 'spec',
  transcript: [],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getTranscript).mockReturnValue([]);
});

// ─── spec generation after interview completion ───────────────────────────────

describe('spec generation after interview completion', () => {
  it('generates a spec artifact with type spec from a valid provider response', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => VALID_SPEC),
    };
    const generator = new SpecGenerator();

    const { result } = await runArtifactPipeline(session, provider, generator, 'spec');

    expect(result.type).toBe('spec');
    expect(result.content).toBe(VALID_SPEC.trim());
  });

  it('transitions session stage to spec and persists the change', async () => {
    const session = makeSession({ stage: 'interview' });
    const provider: ModelProvider = {
      generate: vi.fn(async () => VALID_SPEC),
    };
    const generator = new SpecGenerator();

    const { session: updatedSession } = await runArtifactPipeline(session, provider, generator, 'spec');

    expect(updatedSession.stage).toBe('spec');
    expect(vi.mocked(saveSession)).toHaveBeenCalled();
  });

  it('increments generation attempts in session during pipeline run', async () => {
    const session = makeSession({ generationAttempts: 0 });
    const provider: ModelProvider = {
      generate: vi.fn(async () => VALID_SPEC),
    };
    const generator = new SpecGenerator();

    await runArtifactPipeline(session, provider, generator, 'spec');

    const savedCalls = vi.mocked(saveSession).mock.calls;
    const savedSessions = savedCalls.map((c) => c[0] as Session);
    const withAttempts = savedSessions.find((s) => (s.generationAttempts ?? 0) > 0);
    expect(withAttempts).toBeDefined();
    expect(withAttempts!.generationAttempts).toBe(1);
  });
});

// ─── validator rejects invalid output ────────────────────────────────────────

describe('validator rejects invalid output', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws RetryExhaustedError when provider consistently returns content without required sections', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => '# My Project\n\nSome content without proper sections.'),
    };
    const generator = new SpecGenerator();

    const promise = runArtifactPipeline(session, provider, generator, 'spec');
    // Suppress unhandled-rejection warning while timers are advanced
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(RetryExhaustedError);
    expect(vi.mocked(provider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('validation error cause includes names of missing sections', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const provider: ModelProvider = {
      // Has overview but missing functional requirements and acceptance criteria
      generate: vi.fn(async () => '# Spec\n\n## Project Overview\n\nDesc\n'),
    };
    const generator = new SpecGenerator();

    const promise = runArtifactPipeline(session, provider, generator, 'spec');
    // Suppress unhandled-rejection warning while timers are advanced
    promise.catch(() => {});
    await vi.runAllTimersAsync();

    try {
      await promise;
      expect.fail('should have thrown RetryExhaustedError');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      const retryErr = err as RetryExhaustedError;
      expect(retryErr.cause.message).toContain('functional requirements');
      expect(retryErr.cause.message).toContain('acceptance criteria');
    }
  });

  it('does not throw when all required sections are present', async () => {
    const session = makeSession();
    const provider: ModelProvider = {
      generate: vi.fn(async () => VALID_SPEC),
    };
    const generator = new SpecGenerator();

    await expect(
      runArtifactPipeline(session, provider, generator, 'spec'),
    ).resolves.toBeDefined();
  });
});

// ─── file naming and collision handling ──────────────────────────────────────

describe('file naming and collision handling', () => {
  it('resolves to a -2 suffix when the original filename already exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const filename = 'my-project-spec.md';
      fs.writeFileSync(path.join(tmpDir, filename), 'existing content');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, 'my-project-spec-2.md'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('increments suffix past -2 when both the original and -2 exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const filename = 'my-project-spec.md';
      fs.writeFileSync(path.join(tmpDir, filename), 'v1');
      fs.writeFileSync(path.join(tmpDir, 'my-project-spec-2.md'), 'v2');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, 'my-project-spec-3.md'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('returns the plain path when no collision exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const filename = 'unique-spec.md';

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).toBe(path.join(tmpDir, filename));
      expect(fs.existsSync(resolved)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('generateFilename + resolveOutputPath together produce collision-safe paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const filename = generateFilename('My Project');
      // Pre-create the first file to cause a collision
      fs.writeFileSync(path.join(tmpDir, filename), 'v1');

      const resolved = resolveOutputPath(tmpDir, filename);

      expect(resolved).not.toBe(path.join(tmpDir, filename));
      expect(resolved).toMatch(/-2\.md$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ─── sanitized filenames ──────────────────────────────────────────────────────

describe('sanitized filenames', () => {
  it('removes forward slashes from project names', () => {
    const filename = generateFilename('frontend/backend split');
    expect(filename).not.toContain('/');
    expect(filename).toMatch(/\.md$/);
  });

  it('removes colons from project names', () => {
    const filename = generateFilename('Project: Alpha');
    expect(filename).not.toContain(':');
    expect(filename).toMatch(/\.md$/);
  });

  it('removes angle brackets and quotes from project names', () => {
    const filename = generateFilename('<script>alert("xss")</script>');
    expect(filename).not.toMatch(/[<>"]/);
    expect(filename).toMatch(/\.md$/);
  });

  it('strips leading and trailing dots from project names', () => {
    const filename = generateFilename('.hidden project.');
    const basename = path.basename(filename, '.md');
    expect(basename).not.toMatch(/^\./);
  });

  it('produces a correct hyphenated filename from a normal project name', () => {
    expect(generateFilename('My Awesome Project')).toBe('my-awesome-project-spec.md');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generateFilename('foo   bar   baz')).toBe('foo-bar-baz-spec.md');
  });

  it('lowercases all characters', () => {
    const filename = generateFilename('UPPER CASE PROJECT');
    expect(filename).toBe('upper-case-project-spec.md');
  });
});

// ─── retry behavior on provider failure ──────────────────────────────────────

describe('retry behavior on provider failure', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries provider calls and throws RetryExhaustedError when all attempts fail', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const failingProvider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('connection refused')),
    };
    const generator = new SpecGenerator();

    const promise = generator.generate(session, failingProvider);
    promise.catch(() => {}); // prevent unhandled rejection before assertion attaches
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(vi.mocked(failingProvider.generate)).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
  });

  it('succeeds if provider recovers before retries are exhausted', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    let callCount = 0;
    const transientProvider: ModelProvider = {
      generate: vi.fn(async () => {
        callCount++;
        if (callCount < 3) throw new Error('transient failure');
        return VALID_SPEC;
      }),
    };
    const generator = new SpecGenerator();

    const promise = generator.generate(session, transientProvider);
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.type).toBe('spec');
    expect(callCount).toBe(3);
  });

  it('RetryExhaustedError message includes attempt count', async () => {
    vi.useFakeTimers();
    const session = makeSession();
    const failingProvider: ModelProvider = {
      generate: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const generator = new SpecGenerator();

    const promise = generator.generate(session, failingProvider);
    promise.catch(() => {}); // prevent unhandled rejection before assertion attaches
    await vi.runAllTimersAsync();

    try {
      await promise;
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RetryExhaustedError);
      expect((err as RetryExhaustedError).attempts).toBe(DEFAULT_MAX_ATTEMPTS);
    }
  });
});

// ─── write failure behavior ───────────────────────────────────────────────────

describe('write failure behavior', () => {
  it('throws when writing to a non-existent directory', () => {
    const filePath = '/nonexistent-cobuild-test-dir/output.md';
    expect(() => writeArtifactFile(filePath, '# Content')).toThrow();
  });

  it('thrown error is a filesystem error', () => {
    const filePath = '/nonexistent-cobuild-test-dir/output.md';
    expect(() => writeArtifactFile(filePath, '# Content')).toThrow(/ENOENT|no such file/i);
  });

  it('does not leave a tmp file behind when the target directory does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    // The tmp path lives next to filePath; if the parent subdirectory doesn't exist,
    // writeFileSync fails before creating the tmp file — no cleanup needed.
    try {
      const filePath = path.join(tmpDir, 'nonexistent-subdir', 'output.md');
      try {
        writeArtifactFile(filePath, '# Content');
      } catch {
        // expected
      }
      const remainingTmpFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
      expect(remainingTmpFiles).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writes content successfully to a valid path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const filePath = path.join(tmpDir, 'output.md');
      writeArtifactFile(filePath, VALID_SPEC);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(VALID_SPEC);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('full pipeline write succeeds and content is persisted correctly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-int-'));
    try {
      const session = makeSession({ workingDirectory: tmpDir });
      const provider: ModelProvider = {
        generate: vi.fn(async () => VALID_SPEC),
      };
      const generator = new SpecGenerator();

      const { result } = await runArtifactPipeline(session, provider, generator, 'spec');

      const docsDir = path.join(tmpDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      const filePath = path.join(docsDir, generateFilename(path.basename(tmpDir)));
      writeArtifactFile(filePath, result.content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(VALID_SPEC.trim());
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
