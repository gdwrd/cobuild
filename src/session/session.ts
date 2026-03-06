import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../logging/logger.js';

export interface InterviewMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory: string;
  completed: boolean;
  stage?: 'interview' | 'spec';
  finishedEarly?: boolean;
  transcript: InterviewMessage[];
  model?: string;
  lastError?: string;
}

export function getSessionsDir(): string {
  return path.join(os.homedir(), '.cobuild', 'sessions');
}

export function getSessionFilePath(sessionId: string): string {
  if (path.basename(sessionId) !== sessionId) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

export function createSession(): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    workingDirectory: process.cwd(),
    completed: false,
    stage: 'interview',
    transcript: [],
  };
  return session;
}

export function appendInterviewMessage(
  session: Session,
  role: InterviewMessage['role'],
  content: string,
): Session {
  const message: InterviewMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  const updated: Session = {
    ...session,
    transcript: [...session.transcript, message],
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`interview turn: ${role} (session ${session.id})`);
  return updated;
}

export function getTranscript(session: Session): InterviewMessage[] {
  return session.transcript;
}

export function findLatestByWorkingDirectory(workingDirectory: string): Session | null {
  const sessionsDir = getSessionsDir();

  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  const sessions: Session[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const sessionId = file.slice(0, -5);
    try {
      const session = loadSession(sessionId);
      if (session && session.workingDirectory === workingDirectory) {
        sessions.push(session);
      }
    } catch {
      // skip corrupted session files
    }
  }

  if (sessions.length === 0) return null;

  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sessions[0];
}

export function saveSession(session: Session): void {
  const filePath = getSessionFilePath(session.id);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const json = JSON.stringify(session, null, 2);

  fs.writeFileSync(tmpPath, json, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    throw err;
  }

  getLogger().info(`session saved: ${session.id}`);
}

export function loadSession(sessionId: string): Session | null {
  const filePath = getSessionFilePath(sessionId);
  try {
    const raw = fs.readFileSync(filePath, { encoding: 'utf8' });
    return JSON.parse(raw) as Session;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export function updateSession(session: Session): Session {
  const updated: Session = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  return updated;
}

export function createAndSaveSession(): Session {
  const session = createSession();
  saveSession(session);
  getLogger().info(`session created: ${session.id}`);
  return session;
}

export function persistErrorState(session: Session, error: string): Session {
  const updated: Session = {
    ...session,
    lastError: error,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().error(`session error persisted (session ${session.id}): ${error}`);
  return updated;
}

export function completeInterview(session: Session, finishedEarly: boolean): Session {
  const updated: Session = {
    ...session,
    completed: true,
    stage: 'spec',
    finishedEarly,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `interview completed (session ${session.id}, finishedEarly=${finishedEarly})`,
  );
  return updated;
}
