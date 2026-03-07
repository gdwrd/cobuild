import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => mockLogger,
}));

import {
  ensurePlansDir,
  generateDevPlanFilename,
  writeDevPlanFile,
} from '../dev-plan-file-writer.js';
import type { PlanPhase } from '../../session/session.js';

function makePhase(overrides?: Partial<PlanPhase>): PlanPhase {
  return {
    number: 1,
    title: 'Core Infrastructure',
    goal: 'Build the foundation',
    scope: 'Backend only',
    deliverables: 'API server',
    dependencies: 'None',
    acceptanceCriteria: 'Tests pass',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── ensurePlansDir ───────────────────────────────────────────────────────────

describe('ensurePlansDir', () => {
  it('creates docs/plans directory when it does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const plansDir = ensurePlansDir(tmpDir);
    expect(fs.existsSync(plansDir)).toBe(true);
    expect(plansDir).toBe(path.join(tmpDir, 'docs', 'plans'));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns the plans path without recreating when it already exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const existing = path.join(tmpDir, 'docs', 'plans');
    fs.mkdirSync(existing, { recursive: true });
    const plansDir = ensurePlansDir(tmpDir);
    expect(plansDir).toBe(existing);
    expect(mockLogger.info).not.toHaveBeenCalled();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('logs info when creating the directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    ensurePlansDir(tmpDir);
    expect(mockLogger.info).toHaveBeenCalledOnce();
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/created plans directory/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates parent docs directory if needed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const plansDir = ensurePlansDir(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(true);
    expect(fs.existsSync(plansDir)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── generateDevPlanFilename ──────────────────────────────────────────────────

describe('generateDevPlanFilename', () => {
  const fixedDate = new Date('2026-03-07T12:00:00Z');

  it('generates filename with correct date prefix', () => {
    const phase = makePhase({ number: 1, title: 'Core Infrastructure' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toMatch(/^2026-03-07-/);
  });

  it('includes phase number in filename', () => {
    const phase = makePhase({ number: 3, title: 'Auth' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toContain('-phase-3-');
  });

  it('lowercases the title', () => {
    const phase = makePhase({ number: 1, title: 'UPPERCASE TITLE' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toContain('uppercase-title');
  });

  it('replaces spaces with hyphens', () => {
    const phase = makePhase({ number: 2, title: 'User Auth System' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toContain('user-auth-system');
  });

  it('sanitizes unsafe characters in title', () => {
    const phase = makePhase({ number: 1, title: 'Phase: Alpha/Beta' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toMatch(/\.md$/);
    expect(result).not.toMatch(/[:/]/);
  });

  it('ends with .md extension', () => {
    const phase = makePhase({ number: 4, title: 'Deployment' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toMatch(/\.md$/);
  });

  it('falls back to "phase" when title sanitizes to empty', () => {
    const phase = makePhase({ number: 1, title: '...' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toBe('2026-03-07-phase-1-phase.md');
  });

  it('uses today\'s date when no date is provided', () => {
    const phase = makePhase();
    const result = generateDevPlanFilename(phase);
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    expect(result).toMatch(new RegExp(`^${year}-${month}-${day}-`));
  });

  it('produces full expected filename', () => {
    const phase = makePhase({ number: 2, title: 'Core Infrastructure' });
    const result = generateDevPlanFilename(phase, fixedDate);
    expect(result).toBe('2026-03-07-phase-2-core-infrastructure.md');
  });
});

// ─── writeDevPlanFile ─────────────────────────────────────────────────────────

describe('writeDevPlanFile', () => {
  const fixedContent = '# Plan: Phase 1\n\n## Overview\n\nTest content\n';

  it('writes file under docs/plans/', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const phase = makePhase({ number: 1, title: 'Infrastructure' });
    const result = writeDevPlanFile(tmpDir, phase, fixedContent);
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toContain(path.join('docs', 'plans'));
    expect(fs.readFileSync(result.filePath, 'utf8')).toBe(fixedContent);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns the written file path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const phase = makePhase({ number: 1, title: 'Infrastructure' });
    const result = writeDevPlanFile(tmpDir, phase, fixedContent);
    expect(result.filePath).toBeTruthy();
    expect(path.isAbsolute(result.filePath)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates docs/plans/ if it does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const phase = makePhase();
    writeDevPlanFile(tmpDir, phase, fixedContent);
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'plans'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('handles filename collision by appending numeric suffix', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const phase = makePhase({ number: 1, title: 'Infrastructure' });
    const result1 = writeDevPlanFile(tmpDir, phase, fixedContent);
    const result2 = writeDevPlanFile(tmpDir, phase, fixedContent);
    expect(result1.filePath).not.toBe(result2.filePath);
    expect(fs.existsSync(result1.filePath)).toBe(true);
    expect(fs.existsSync(result2.filePath)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('logs start and success messages', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-test-'));
    const phase = makePhase({ number: 2, title: 'Auth' });
    writeDevPlanFile(tmpDir, phase, fixedContent);
    const infoCalls = mockLogger.info.mock.calls.map((c) => c[0]);
    expect(infoCalls.some((m) => m.includes('writing dev plan for phase 2'))).toBe(true);
    expect(infoCalls.some((m) => m.includes('written successfully'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
