import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { persistCurrentDevPlanPhase, persistDevPlanPhaseCompletion } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { loadAndValidatePhases } from './dev-plan-phases.js';
import { DevPlanGenerator } from './dev-plan-generator.js';
import { writeDevPlanFile } from './dev-plan-file-writer.js';

export interface DevPlanLoopOptions {
  onPhaseStart: (phaseNumber: number, total: number) => void;
  onPhaseComplete: (phaseNumber: number, filePath: string) => void;
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

  let previousDevPlans: string[] = [];
  let currentSession = initialSession;

  for (const phase of phases) {
    logger.info(
      `dev-plan loop: starting phase ${phase.number} of ${totalCount} (session ${currentSession.id})`,
    );

    currentSession = persistCurrentDevPlanPhase(currentSession, phase.number);
    options.onPhaseStart(phase.number, totalCount);

    const generator = new DevPlanGenerator();
    const result = await generator.generate(currentSession, provider, phase, previousDevPlans);

    const { filePath } = writeDevPlanFile(currentSession.workingDirectory, phase, result.content);
    currentSession = persistDevPlanPhaseCompletion(
      currentSession,
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

  logger.info(
    `dev-plan loop: all ${totalCount} phases generated successfully (session ${currentSession.id})`,
  );
  return currentSession;
}
