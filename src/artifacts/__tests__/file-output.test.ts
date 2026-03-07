import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import {
  ensureDocsDir,
  generateFilename,
  generateArchitectureFilename,
  generatePlanFilename,
  sanitizeFilename,
  resolveOutputPath,
  writeArtifactFile,
} from '../file-output.js';

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── ensureDocsDir ───────────────────────────────────────────────────────────

describe('ensureDocsDir', () => {
  it('creates the docs directory when it does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const docsDir = ensureDocsDir(tmpDir);
    expect(fs.existsSync(docsDir)).toBe(true);
    expect(docsDir).toBe(path.join(tmpDir, 'docs'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns the docs path without recreating when it already exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const existingDocs = path.join(tmpDir, 'docs');
    fs.mkdirSync(existingDocs);
    const docsDir = ensureDocsDir(tmpDir);
    expect(docsDir).toBe(existingDocs);
    // Should not log creation
    expect(mockLogger.info).not.toHaveBeenCalled();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('logs info when creating the directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    ensureDocsDir(tmpDir);
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/created docs directory/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates the docs directory when the project directory does not yet exist (recursive)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    // projectDir itself does not exist yet (nested under tmpDir)
    const projectDir = path.join(tmpDir, 'nested', 'project');
    const docsDir = ensureDocsDir(projectDir);
    expect(fs.existsSync(docsDir)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throws when the docs path exists but is a file, not a directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const docsPath = path.join(tmpDir, 'docs');
    // Create a regular file at the docs path
    fs.writeFileSync(docsPath, 'not a directory');
    expect(() => ensureDocsDir(tmpDir)).toThrow(/not a directory/);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── generateFilename ────────────────────────────────────────────────────────

describe('generateFilename', () => {
  it('generates a kebab-case spec filename from a project name', () => {
    expect(generateFilename('My Cool Project')).toBe('my-cool-project-spec.md');
  });

  it('lowercases the filename', () => {
    expect(generateFilename('UPPERCASE')).toBe('uppercase-spec.md');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generateFilename('foo   bar')).toBe('foo-bar-spec.md');
  });

  it('sanitizes unsafe characters', () => {
    const result = generateFilename('Project: Alpha/Beta');
    expect(result).toMatch(/\.md$/);
    expect(result).not.toMatch(/[:/]/);
  });

  it('appends -spec.md suffix', () => {
    expect(generateFilename('widget')).toBe('widget-spec.md');
  });

  it('falls back to project-spec.md for empty input', () => {
    expect(generateFilename('')).toBe('project-spec.md');
  });

  it('falls back to project-spec.md for input that sanitizes to empty', () => {
    // A string of only dots becomes empty after safeFilename trims leading/trailing dots
    expect(generateFilename('...')).toBe('project-spec.md');
  });
});

// ─── generateArchitectureFilename ────────────────────────────────────────────

describe('generateArchitectureFilename', () => {
  it('generates a kebab-case architecture filename from a project name', () => {
    expect(generateArchitectureFilename('My Cool Project')).toBe('my-cool-project-architecture.md');
  });

  it('lowercases the filename', () => {
    expect(generateArchitectureFilename('UPPERCASE')).toBe('uppercase-architecture.md');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generateArchitectureFilename('foo   bar')).toBe('foo-bar-architecture.md');
  });

  it('sanitizes unsafe characters', () => {
    const result = generateArchitectureFilename('Project: Alpha/Beta');
    expect(result).toMatch(/\.md$/);
    expect(result).not.toMatch(/[:/]/);
  });

  it('appends -architecture.md suffix', () => {
    expect(generateArchitectureFilename('widget')).toBe('widget-architecture.md');
  });

  it('falls back to project-architecture.md for empty input', () => {
    expect(generateArchitectureFilename('')).toBe('project-architecture.md');
  });
});

// ─── generatePlanFilename ─────────────────────────────────────────────────────

describe('generatePlanFilename', () => {
  it('generates a kebab-case high-level-plan filename from a project name', () => {
    expect(generatePlanFilename('My Cool Project')).toBe('my-cool-project-high-level-plan.md');
  });

  it('lowercases the filename', () => {
    expect(generatePlanFilename('UPPERCASE')).toBe('uppercase-high-level-plan.md');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(generatePlanFilename('foo   bar')).toBe('foo-bar-high-level-plan.md');
  });

  it('sanitizes unsafe characters', () => {
    const result = generatePlanFilename('Project: Alpha/Beta');
    expect(result).toMatch(/\.md$/);
    expect(result).not.toMatch(/[:/]/);
  });

  it('appends -high-level-plan.md suffix', () => {
    expect(generatePlanFilename('widget')).toBe('widget-high-level-plan.md');
  });

  it('falls back to project-high-level-plan.md for empty input', () => {
    expect(generatePlanFilename('')).toBe('project-high-level-plan.md');
  });
});

// ─── sanitizeFilename ────────────────────────────────────────────────────────

describe('sanitizeFilename', () => {
  it('strips unsafe characters', () => {
    const result = sanitizeFilename('foo:bar/baz');
    expect(result).not.toMatch(/[:/]/);
  });

  it('strips leading and trailing dots', () => {
    expect(sanitizeFilename('.hidden.')).toBe('hidden');
  });

  it('truncates at 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(255);
  });

  it('returns clean names unchanged', () => {
    expect(sanitizeFilename('my-project')).toBe('my-project');
  });
});

// ─── resolveOutputPath ───────────────────────────────────────────────────────

describe('resolveOutputPath', () => {
  it('returns the plain path when no collision exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const result = resolveOutputPath(tmpDir, 'spec.md');
    expect(result).toBe(path.join(tmpDir, 'spec.md'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('appends -2 suffix when original filename is taken', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    fs.writeFileSync(path.join(tmpDir, 'spec.md'), 'existing');
    const result = resolveOutputPath(tmpDir, 'spec.md');
    expect(result).toBe(path.join(tmpDir, 'spec-2.md'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('increments suffix until a free slot is found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    fs.writeFileSync(path.join(tmpDir, 'spec.md'), 'v1');
    fs.writeFileSync(path.join(tmpDir, 'spec-2.md'), 'v2');
    fs.writeFileSync(path.join(tmpDir, 'spec-3.md'), 'v3');
    const result = resolveOutputPath(tmpDir, 'spec.md');
    expect(result).toBe(path.join(tmpDir, 'spec-4.md'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('logs a collision message when a suffix is used', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    fs.writeFileSync(path.join(tmpDir, 'spec.md'), 'existing');
    resolveOutputPath(tmpDir, 'spec.md');
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/collision/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not log when there is no collision', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    resolveOutputPath(tmpDir, 'spec.md');
    expect(mockLogger.info).not.toHaveBeenCalled();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throws after 1000 collision attempts and logs an error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    // Create the base file plus spec-2.md through spec-1000.md (1000 files total)
    fs.writeFileSync(path.join(tmpDir, 'spec.md'), '');
    for (let i = 2; i <= 1000; i++) {
      fs.writeFileSync(path.join(tmpDir, `spec-${i}.md`), '');
    }
    expect(() => resolveOutputPath(tmpDir, 'spec.md')).toThrow(/1000 attempts/);
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/1000 attempts/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('handles a filename with no extension when resolving collisions', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    fs.writeFileSync(path.join(tmpDir, 'noext'), 'existing');
    const result = resolveOutputPath(tmpDir, 'noext');
    expect(result).toBe(path.join(tmpDir, 'noext-2'));
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── writeArtifactFile ───────────────────────────────────────────────────────

describe('writeArtifactFile', () => {
  it('writes content to the given path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const filePath = path.join(tmpDir, 'output.md');
    writeArtifactFile(filePath, '# Hello\n');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('# Hello\n');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('logs info on successful write', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const filePath = path.join(tmpDir, 'output.md');
    writeArtifactFile(filePath, '# Content\n');
    expect(mockLogger.info).toHaveBeenCalledTimes(2);
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/writing artifact/);
    expect(mockLogger.info.mock.calls[1][0]).toMatch(/written successfully/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throws and logs error when the directory does not exist', () => {
    const filePath = '/nonexistent-dir-cobuild-test/output.md';
    expect(() => writeArtifactFile(filePath, 'content')).toThrow();
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][0]).toMatch(/failed to write/);
  });

  it('does not leave a tmp file when the target directory does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    // The tmp path lives next to filePath; if the directory doesn't exist,
    // writeFileSync fails before creating the tmp file — no cleanup is needed.
    const filePath = path.join(tmpDir, 'nonexistent-subdir', 'output.md');
    try {
      writeArtifactFile(filePath, 'content');
    } catch {
      /* expected */
    }
    // No tmp files should exist in the parent tmpDir
    const files = fs.readdirSync(tmpDir);
    expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
