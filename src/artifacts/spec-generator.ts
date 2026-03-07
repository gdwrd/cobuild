import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession, persistErrorState } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { ArtifactGenerator, ArtifactResult } from './generator.js';
import { buildSpecMessages, logSpecPromptMetadata } from './spec-prompt.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../interview/retry.js';

export function normalizeSpecOutput(raw: string): string {
  return raw.trim();
}

export function incrementGenerationAttempts(session: Session): Session {
  const attempts = (session.generationAttempts ?? 0) + 1;
  const updated: Session = {
    ...session,
    generationAttempts: attempts,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`spec generator: attempt ${attempts} (session ${session.id})`);
  return updated;
}

export class SpecGenerator implements ArtifactGenerator {
  async generate(session: Session, provider: ModelProvider): Promise<ArtifactResult> {
    const logger = getLogger();

    const messages = buildSpecMessages(session);
    logSpecPromptMetadata(session, messages);
    logger.debug(`spec generator: raw request messages: ${JSON.stringify(messages)}`);

    const updatedSession = incrementGenerationAttempts(session);

    logger.info(
      `spec generator: starting provider call with up to ${DEFAULT_MAX_ATTEMPTS} retries (session ${updatedSession.id})`,
    );
    const raw = await withRetry(() => provider.generate(messages), {
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      onRetryExhausted: (err, attempts) => {
        const errorMsg = `spec generation failed after ${attempts} attempts: ${err.message}`;
        logger.error(`spec generator: ${errorMsg} (session ${updatedSession.id})`);
        persistErrorState(updatedSession, errorMsg);
      },
    });
    logger.debug(`spec generator: raw response: ${JSON.stringify(raw)}`);
    logger.info(
      `spec generator: response received (length=${raw.length}, session ${updatedSession.id})`,
    );

    const content = normalizeSpecOutput(raw);
    return { type: 'spec', content };
  }
}
