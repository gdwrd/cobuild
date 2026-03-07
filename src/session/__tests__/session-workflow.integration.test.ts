import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../logging/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// Use a real temp directory as the home dir so session I/O is real
let tempHome: string;

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: () => tempHome,
  };
});

import {
  createSession,
  saveSession,
  loadSession,
  findLatestByWorkingDirectory,
  migrateSession,
  completeInterview,
  CURRENT_SCHEMA_VERSION,
} from '../session.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function sessionsDir(): string {
  return path.join(tempHome, '.cobuild', 'sessions');
}

function ensureSessionsDir(): void {
  fs.mkdirSync(sessionsDir(), { recursive: true });
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-session-workflow-'));
  ensureSessionsDir();
});

afterEach(() => {
  fs.rmSync(tempHome, { recursive: true });
});

// ─── fresh session workflow ───────────────────────────────────────────────────

describe('fresh session workflow', () => {
  it('creates a session with current schema version', () => {
    const session = createSession();
    expect(session.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('creates a session with stage=interview and completed=false', () => {
    const session = createSession();
    expect(session.stage).toBe('interview');
    expect(session.completed).toBe(false);
  });

  it('creates a session with a valid UUID', () => {
    const session = createSession();
    expect(session.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns null from findLatestByWorkingDirectory for a fresh project directory', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-fresh-project-'));
    try {
      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).toBeNull();
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('saves a session to disk atomically and can be loaded back', () => {
    const session = createSession();
    saveSession(session);

    const loaded = loadSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(session.id);
    expect(loaded!.stage).toBe('interview');
    expect(loaded!.completed).toBe(false);
  });

  it('saved session file has mode 0o600', () => {
    const session = createSession();
    saveSession(session);

    const filePath = path.join(sessionsDir(), `${session.id}.json`);
    const stat = fs.statSync(filePath);
    // On Linux, stat.mode & 0o777 should be 0o600
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('findLatestByWorkingDirectory finds the newly created session in the same dir', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-fresh-project-'));
    try {
      const session = { ...createSession(), workingDirectory: projectDir };
      saveSession(session);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('does not find sessions for a different working directory', () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-proj1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-proj2-'));
    try {
      const session = { ...createSession(), workingDirectory: dir1 };
      saveSession(session);

      const found = findLatestByWorkingDirectory(dir2);
      expect(found).toBeNull();
    } finally {
      fs.rmSync(dir1, { recursive: true });
      fs.rmSync(dir2, { recursive: true });
    }
  });

  it('does not return completed sessions as resumable', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-completed-'));
    try {
      let session = { ...createSession(), workingDirectory: projectDir };
      saveSession(session);
      session = completeInterview(session, false);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).toBeNull();
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });
});

// ─── restored session workflow ────────────────────────────────────────────────

describe('restored session workflow', () => {
  it('finds and returns an existing incomplete session', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-restore-'));
    try {
      const session = { ...createSession(), workingDirectory: projectDir };
      saveSession(session);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.workingDirectory).toBe(projectDir);
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('resumes a halted dev-plans session', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-restore-dev-'));
    try {
      const session = {
        ...createSession(),
        workingDirectory: projectDir,
        completed: true,
        stage: 'dev-plans' as const,
        devPlanHalted: true,
        devPlansComplete: false,
      };
      saveSession(session);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('does not return a completed dev-plans session', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-restore-done-'));
    try {
      const session = {
        ...createSession(),
        workingDirectory: projectDir,
        completed: true,
        stage: 'dev-plans' as const,
        devPlansComplete: true,
      };
      saveSession(session);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).toBeNull();
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('returns the most recent session when multiple incomplete sessions exist', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-multi-'));
    try {
      const older = {
        ...createSession(),
        workingDirectory: projectDir,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const newer = {
        ...createSession(),
        workingDirectory: projectDir,
        createdAt: '2026-02-01T00:00:00.000Z',
      };
      saveSession(older);
      saveSession(newer);

      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(newer.id);
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('skips corrupted session files gracefully', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-corrupt-'));
    try {
      // Write a corrupt JSON file
      const corruptFile = path.join(sessionsDir(), 'corrupt-session-id.json');
      fs.writeFileSync(corruptFile, '{ invalid json @@@ }', 'utf8');

      // Write a valid session
      const session = { ...createSession(), workingDirectory: projectDir };
      saveSession(session);

      // Should still find the valid session despite the corrupt one
      const found = findLatestByWorkingDirectory(projectDir);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
    } finally {
      fs.rmSync(projectDir, { recursive: true });
    }
  });

  it('returns null gracefully when sessions dir does not exist', () => {
    // Remove the sessions dir
    fs.rmSync(sessionsDir(), { recursive: true });

    const found = findLatestByWorkingDirectory('/some/new/project');
    expect(found).toBeNull();
  });
});

// ─── schema migration ─────────────────────────────────────────────────────────

describe('schema migration', () => {
  it('assigns current schema version to sessions missing schemaVersion', () => {
    const raw = {
      id: 'old-session',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      workingDirectory: '/old/project',
      completed: false,
      transcript: [],
    };
    const migrated = migrateSession(raw);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves existing fields when migrating', () => {
    const raw = {
      id: 'old-session',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      workingDirectory: '/old/project',
      completed: true,
      stage: 'spec',
      transcript: [{ role: 'user', content: 'hello', timestamp: '2025-01-01T00:00:00.000Z' }],
      model: 'llama3',
    };
    const migrated = migrateSession(raw);
    expect(migrated.id).toBe('old-session');
    expect(migrated.workingDirectory).toBe('/old/project');
    expect(migrated.completed).toBe(true);
    expect(migrated.stage).toBe('spec');
    expect(migrated.transcript).toHaveLength(1);
    expect(migrated.model).toBe('llama3');
  });

  it('provides safe defaults for missing required fields', () => {
    const raw = {};
    const migrated = migrateSession(raw);
    expect(migrated.id).toBe('');
    expect(migrated.completed).toBe(false);
    expect(migrated.stage).toBe('interview');
    expect(migrated.transcript).toEqual([]);
  });

  it('loads a session without schemaVersion from disk and migrates it transparently', () => {
    const raw = {
      id: 'migrated-session-1',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      workingDirectory: '/some/project',
      completed: false,
      transcript: [],
    };
    const filePath = path.join(sessionsDir(), 'migrated-session-1.json');
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf8');

    const loaded = loadSession('migrated-session-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded!.id).toBe('migrated-session-1');
  });

  it('returns null for a session file with non-object JSON', () => {
    const filePath = path.join(sessionsDir(), 'array-session.json');
    fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]), 'utf8');

    const loaded = loadSession('array-session');
    expect(loaded).toBeNull();
  });
});
