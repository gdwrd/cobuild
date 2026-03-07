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

export interface SpecArtifact {
  content: string;
  filePath: string;
  generated: boolean;
}

export interface ArchitectureArtifact {
  content: string;
  filePath: string;
  generated: boolean;
}

export interface PlanArtifact {
  content: string;
  filePath: string;
  generated: boolean;
}

export interface DevPlanArtifact {
  phaseNumber: number;
  content: string;
  filePath: string;
  generated: boolean;
}

export interface PlanPhase {
  number: number;
  title: string;
  goal: string;
  scope: string;
  deliverables: string;
  dependencies: string;
  acceptanceCriteria: string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory: string;
  completed: boolean;
  stage?: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';
  finishedEarly?: boolean;
  transcript: InterviewMessage[];
  model?: string;
  lastError?: string;
  generationAttempts?: number;
  specArtifact?: SpecArtifact;
  architectureDecision?: boolean;
  planDecision?: boolean;
  devPlansDecision?: boolean;
  architectureArtifact?: ArchitectureArtifact;
  planArtifact?: PlanArtifact;
  architectureGenerationAttempts?: number;
  planGenerationAttempts?: number;
  devPlanGenerationAttempts?: number;
  extractedPhases?: PlanPhase[];
  devPlanArtifacts?: DevPlanArtifact[];
  completedPhaseCount?: number;
  currentDevPlanPhase?: number;
  devPlanHalted?: boolean;
  devPlansComplete?: boolean;
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
  return session.transcript ?? [];
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
    if (!sessionId) continue;
    if (sessionId.includes(path.sep) || sessionId.includes('/')) continue;
    try {
      const session = loadSession(sessionId);
      if (!session || session.workingDirectory !== workingDirectory) continue;
      const isResumeableInterview = !session.completed;
      const isResumeableDevPlan =
        session.stage === 'dev-plans' && !session.devPlansComplete;
      if (isResumeableInterview || isResumeableDevPlan) {
        sessions.push(session);
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        // skip corrupted/invalid JSON session files
      } else {
        throw err;
      }
    }
  }

  if (sessions.length === 0) return null;

  sessions.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
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

export function persistSpecArtifact(session: Session, content: string, filePath: string): Session {
  const updated: Session = {
    ...session,
    specArtifact: { content, filePath, generated: true },
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`artifact persistence: spec artifact saved to ${filePath} (session ${session.id})`);
  return updated;
}

export function completeSpecStage(session: Session): Session {
  const updated: Session = {
    ...session,
    stage: 'architecture',
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`spec stage complete: transitioning to architecture stage (session ${session.id})`);
  return updated;
}

export function persistWorkflowDecision(
  session: Session,
  stage: 'architecture' | 'plan',
  decision: boolean,
): Session {
  const field = stage === 'architecture' ? 'architectureDecision' : 'planDecision';
  const updated: Session = {
    ...session,
    [field]: decision,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `workflow decision: ${stage}=${decision} (session ${session.id})`,
  );
  return updated;
}

export function persistArchitectureArtifact(
  session: Session,
  content: string,
  filePath: string,
): Session {
  const updated: Session = {
    ...session,
    architectureArtifact: { content, filePath, generated: true },
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `artifact persistence: architecture artifact saved to ${filePath} (session ${session.id})`,
  );
  return updated;
}

export function completeArchitectureStage(session: Session): Session {
  const updated: Session = {
    ...session,
    stage: 'plan',
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `architecture stage complete: transitioning to plan stage (session ${session.id})`,
  );
  return updated;
}

export function persistPlanArtifact(
  session: Session,
  content: string,
  filePath: string,
): Session {
  const updated: Session = {
    ...session,
    planArtifact: { content, filePath, generated: true },
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `artifact persistence: plan artifact saved to ${filePath} (session ${session.id})`,
  );
  return updated;
}

export function completePlanStage(session: Session): Session {
  const updated: Session = {
    ...session,
    stage: 'plan',
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`plan stage complete (session ${session.id})`);
  return updated;
}

export function persistDevPlansDecision(session: Session, decision: boolean): Session {
  const updated: Session = {
    ...session,
    devPlansDecision: decision,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `workflow decision: dev-plans=${decision} (session ${session.id})`,
  );
  return updated;
}

export function persistExtractedPhases(session: Session, phases: PlanPhase[]): Session {
  const updated: Session = {
    ...session,
    extractedPhases: phases,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `artifact persistence: ${phases.length} extracted phases saved (session ${session.id})`,
  );
  return updated;
}

export function persistDevPlanPhaseCompletion(
  session: Session,
  phaseNumber: number,
  content: string,
  filePath: string,
): Session {
  const existing = session.devPlanArtifacts ?? [];
  const artifact: DevPlanArtifact = { phaseNumber, content, filePath, generated: true };
  const completedPhaseCount = (session.completedPhaseCount ?? 0) + 1;
  const updated: Session = {
    ...session,
    devPlanArtifacts: [...existing, artifact],
    completedPhaseCount,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(
    `dev-plan phase completion: phase ${phaseNumber} saved to ${filePath}, completedPhaseCount=${completedPhaseCount} (session ${session.id})`,
  );
  return updated;
}

export function persistDevPlanHalt(session: Session, failedPhaseNumber: number): Session {
  const updated: Session = {
    ...session,
    devPlanHalted: true,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().error(
    `dev-plan halt: generation stopped at phase ${failedPhaseNumber} due to retry exhaustion (session ${session.id})`,
  );
  return updated;
}

export function persistCurrentDevPlanPhase(session: Session, phaseNumber: number): Session {
  const updated: Session = {
    ...session,
    currentDevPlanPhase: phaseNumber,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`dev-plan loop: current phase set to ${phaseNumber} (session ${session.id})`);
  return updated;
}

export function persistDevPlanStage(session: Session): Session {
  const updated: Session = {
    ...session,
    stage: 'dev-plans',
    devPlanHalted: undefined,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`dev-plan loop: stage set to dev-plans (session ${session.id})`);
  return updated;
}

export function completeDevPlanStage(session: Session): Session {
  const updated: Session = {
    ...session,
    devPlansComplete: true,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`dev-plan stage complete (session ${session.id})`);
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
