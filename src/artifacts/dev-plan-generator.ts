import type { Session, PlanPhase } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession, persistErrorState } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import { buildDevPlanMessages, logDevPlanPromptMetadata } from './dev-plan-prompt.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../interview/retry.js';

export interface DevPlanResult {
  content: string;
  phaseNumber: number;
}

export function normalizeDevPlanOutput(raw: string): string {
  return raw.trim();
}

export function incrementDevPlanGenerationAttempts(session: Session): Session {
  const attempts = (session.devPlanGenerationAttempts ?? 0) + 1;
  const updated: Session = {
    ...session,
    devPlanGenerationAttempts: attempts,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`dev-plan generator: attempt ${attempts} (session ${session.id})`);
  return updated;
}

export class DevPlanGenerator {
  async generate(
    session: Session,
    provider: ModelProvider,
    phase: PlanPhase,
    previousDevPlans: string[],
  ): Promise<DevPlanResult> {
    const logger = getLogger();

    const messages = buildDevPlanMessages(session, phase, previousDevPlans);
    logDevPlanPromptMetadata(session, phase, messages, previousDevPlans);
    logger.debug(`dev-plan generator: raw request messages: ${JSON.stringify(messages)}`);

    const updatedSession = incrementDevPlanGenerationAttempts(session);

    logger.info(
      `dev-plan generator: starting provider call for phase ${phase.number} with up to ${DEFAULT_MAX_ATTEMPTS} retries (session ${updatedSession.id})`,
    );
    const content = await withRetry(
      async () => {
        const raw = await provider.generate(messages);
        logger.debug(`dev-plan generator: raw response: ${JSON.stringify(raw)}`);
        logger.info(
          `dev-plan generator: response received for phase ${phase.number} (length=${raw.length}, session ${updatedSession.id})`,
        );
        return normalizeDevPlanOutput(raw);
      },
      {
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        onRetryExhausted: (err, attempts) => {
          const errorMsg = `dev plan generation failed for phase ${phase.number} after ${attempts} attempts: ${err.message}`;
          logger.error(`dev-plan generator: ${errorMsg} (session ${updatedSession.id})`);
          persistErrorState(updatedSession, errorMsg);
        },
      },
    );
    return { content, phaseNumber: phase.number };
  }
}
