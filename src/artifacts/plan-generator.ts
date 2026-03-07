import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession, persistErrorState } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { ArtifactGenerator, ArtifactResult } from './generator.js';
import { buildPlanMessages, logPlanPromptMetadata } from './plan-prompt.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../interview/retry.js';

export function normalizePlanOutput(raw: string): string {
  return raw.trim();
}

export function incrementPlanGenerationAttempts(session: Session): Session {
  const attempts = (session.planGenerationAttempts ?? 0) + 1;
  const updated: Session = {
    ...session,
    planGenerationAttempts: attempts,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`plan generator: attempt ${attempts} (session ${session.id})`);
  return updated;
}

export class PlanGenerator implements ArtifactGenerator {
  async generate(session: Session, provider: ModelProvider): Promise<ArtifactResult> {
    const logger = getLogger();

    const messages = buildPlanMessages(session);
    logPlanPromptMetadata(session, messages);
    logger.debug(`plan generator: raw request messages: ${JSON.stringify(messages)}`);

    const updatedSession = incrementPlanGenerationAttempts(session);

    logger.info(
      `plan generator: starting provider call with up to ${DEFAULT_MAX_ATTEMPTS} retries (session ${updatedSession.id})`,
    );
    const content = await withRetry(
      async () => {
        const raw = await provider.generate(messages);
        logger.debug(`plan generator: raw response: ${JSON.stringify(raw)}`);
        logger.info(
          `plan generator: response received (length=${raw.length}, session ${updatedSession.id})`,
        );
        return normalizePlanOutput(raw);
      },
      {
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        onRetryExhausted: (err, attempts) => {
          const errorMsg = `plan generation failed after ${attempts} attempts: ${err.message}`;
          logger.error(`plan generator: ${errorMsg} (session ${updatedSession.id})`);
          persistErrorState(updatedSession, errorMsg);
        },
      },
    );
    return { type: 'plan', content };
  }
}
