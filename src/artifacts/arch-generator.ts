import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession, persistErrorState } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { ArtifactGenerator, ArtifactResult } from './generator.js';
import { buildArchMessages, logArchPromptMetadata } from './arch-prompt.js';
import { withRetry, DEFAULT_MAX_ATTEMPTS } from '../interview/retry.js';

export function normalizeArchOutput(raw: string): string {
  return raw.trim();
}

export function incrementArchGenerationAttempts(session: Session): Session {
  const attempts = (session.architectureGenerationAttempts ?? 0) + 1;
  const updated: Session = {
    ...session,
    architectureGenerationAttempts: attempts,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  getLogger().info(`arch generator: attempt ${attempts} (session ${session.id})`);
  return updated;
}

export class ArchGenerator implements ArtifactGenerator {
  async generate(session: Session, provider: ModelProvider): Promise<ArtifactResult> {
    const logger = getLogger();

    const messages = buildArchMessages(session);
    logArchPromptMetadata(session, messages);
    logger.debug(`arch generator: raw request messages: ${JSON.stringify(messages)}`);

    const updatedSession = incrementArchGenerationAttempts(session);

    logger.info(
      `arch generator: starting provider call with up to ${DEFAULT_MAX_ATTEMPTS} retries (session ${updatedSession.id})`,
    );
    const content = await withRetry(
      async () => {
        const raw = await provider.generate(messages);
        logger.debug(`arch generator: raw response: ${JSON.stringify(raw)}`);
        logger.info(
          `arch generator: response received (length=${raw.length}, session ${updatedSession.id})`,
        );
        return normalizeArchOutput(raw);
      },
      {
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        onRetryExhausted: (err, attempts) => {
          const errorMsg = `architecture generation failed after ${attempts} attempts: ${err.message}`;
          logger.error(`arch generator: ${errorMsg} (session ${updatedSession.id})`);
          persistErrorState(updatedSession, errorMsg);
        },
      },
    );
    return { type: 'architecture', content };
  }
}
