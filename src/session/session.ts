import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../logging/logger.js';

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory: string;
}

export function getSessionsDir(): string {
  return path.join(os.homedir(), '.cobuild', 'sessions');
}

export function getSessionFilePath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

export function createSession(): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    workingDirectory: process.cwd(),
  };
  return session;
}

export function saveSession(session: Session): void {
  const filePath = getSessionFilePath(session.id);
  const tmpPath = `${filePath}.tmp`;
  const json = JSON.stringify(session, null, 2);

  fs.writeFileSync(tmpPath, json, { encoding: 'utf8' });
  fs.renameSync(tmpPath, filePath);

  getLogger().info(`session saved: ${session.id}`);
}

export function loadSession(sessionId: string): Session | null {
  const filePath = getSessionFilePath(sessionId);
  try {
    const raw = fs.readFileSync(filePath, { encoding: 'utf8' });
    return JSON.parse(raw) as Session;
  } catch {
    return null;
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
