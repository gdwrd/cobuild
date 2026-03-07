import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession } from '../session/session.js';
import { getLogger } from '../logging/logger.js';
import type { ArtifactGenerator, ArtifactResult } from './generator.js';
import { buildSpecMessages, logSpecPromptMetadata } from './spec-prompt.js';

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

    const raw = await provider.generate(messages);
    logger.debug(`spec generator: raw response: ${JSON.stringify(raw)}`);
    logger.info(
      `spec generator: response received (length=${raw.length}, session ${updatedSession.id})`,
    );

    const content = normalizeSpecOutput(raw);
    return { type: 'spec', content };
  }
}
