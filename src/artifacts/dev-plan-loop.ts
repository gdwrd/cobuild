import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import {
  persistCurrentDevPlanPhase,
  persistDevPlanPhaseCompletion,
  persistDevPlanHalt,
  persistDevPlanStage,
  completeDevPlanStage,
  loadSession,
} from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { RetryExhaustedError } from '../interview/retry.js';
import { loadAndValidatePhases } from './dev-plan-phases.js';
import { DevPlanGenerator } from './dev-plan-generator.js';
import { writeDevPlanFile } from './dev-plan-file-writer.js';

export interface DevPlanLoopOptions {
  onPhaseStart: (phaseNumber: number, total: number) => void;
  onPhaseComplete: (phaseNumber: number, filePath: string) => void;
  onHalt?: (phaseNumber: number) => void;
}

export async function runDevPlanLoop(
  initialSession: Session,
  provider: ModelProvider,
  options: DevPlanLoopOptions,
): Promise<Session> {
  const logger = getLogger();
  const { phases, totalCount } = loadAndValidatePhases(initialSession);

  logger.info(
    `dev-plan loop: starting sequential generation for ${totalCount} phases (session ${initialSession.id})`,
  );

  // Detect already-completed phases for resume
  const completedArtifacts = initialSession.devPlanArtifacts ?? [];
  const completedPhaseNumbers = new Set(completedArtifacts.map((a) => a.phaseNumber));

  if (completedArtifacts.length > 0) {
    const nextPhase = phases.find((p) => !completedPhaseNumbers.has(p.number));
    const nextPhaseNumber = nextPhase?.number ?? completedArtifacts.length + 1;
    logger.info(
      `dev-plan loop: resuming — ${completedArtifacts.length} phase(s) already complete, continuing from phase ${nextPhaseNumber} (session ${initialSession.id})`,
    );
    for (const artifact of completedArtifacts) {
      options.onPhaseComplete(artifact.phaseNumber, artifact.filePath);
    }
  }

  let previousDevPlans: string[] = completedArtifacts.map((a) => a.content);
  // persistDevPlanStage is already called by workflow-controller on a fresh run; on resume the
  // stage is already 'dev-plans'. Only call it here if the session is not yet in dev-plans stage
  // (guards against the double-write on the normal path while still handling edge cases).
  let currentSession =
    initialSession.stage === 'dev-plans'
      ? initialSession
      : persistDevPlanStage(initialSession);

  let halted = false;

  for (const phase of phases) {
    if (completedPhaseNumbers.has(phase.number)) {
      continue;
    }
    logger.info(
      `dev-plan loop: starting phase ${phase.number} of ${totalCount} (session ${currentSession.id})`,
    );

    currentSession = persistCurrentDevPlanPhase(currentSession, phase.number);
    options.onPhaseStart(phase.number, totalCount);

    const generator = new DevPlanGenerator();
    let result;
    try {
      result = await generator.generate(currentSession, provider, phase, previousDevPlans);
    } catch (err) {
      if (err instanceof RetryExhaustedError) {
        logger.error(
          `dev-plan loop: halting generation after retry exhaustion at phase ${phase.number} (session ${currentSession.id})`,
        );
        // Reload from disk to pick up devPlanGenerationAttempts and lastError written by the generator
        const latestSession = loadSession(currentSession.id) ?? currentSession;
        currentSession = persistDevPlanHalt(latestSession, phase.number);
        options.onHalt?.(phase.number);
        halted = true;
        break;
      }
      throw err;
    }

    const { filePath } = writeDevPlanFile(currentSession.workingDirectory, phase, result.content);
    // Reload from disk to pick up devPlanGenerationAttempts written by the generator
    const latestSession = loadSession(currentSession.id) ?? currentSession;
    currentSession = persistDevPlanPhaseCompletion(
      latestSession,
      phase.number,
      result.content,
      filePath,
    );
    previousDevPlans = [...previousDevPlans, result.content];

    logger.info(
      `dev-plan loop: phase ${phase.number} complete, saved to ${filePath} (session ${currentSession.id})`,
    );
    options.onPhaseComplete(phase.number, filePath);
  }

  if (!halted) {
    currentSession = completeDevPlanStage(currentSession);
    logger.info(
      `dev-plan loop: all ${totalCount} phases generated successfully (session ${currentSession.id})`,
    );
  }
  return currentSession;
}
