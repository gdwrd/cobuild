import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import { saveSession } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export type ArtifactType = 'spec';

export interface ArtifactResult {
  type: ArtifactType;
  content: string;
}

export interface ArtifactGenerator {
  generate(session: Session, provider: ModelProvider): Promise<ArtifactResult>;
}

export function transitionToArtifactStage(session: Session, type: ArtifactType): Session {
  const logger = getLogger();
  const updated: Session = {
    ...session,
    stage: type,
    updatedAt: new Date().toISOString(),
  };
  saveSession(updated);
  logger.info(`artifact pipeline: stage transition to '${type}' (session ${session.id})`);
  return updated;
}

export async function runArtifactPipeline(
  session: Session,
  provider: ModelProvider,
  generator: ArtifactGenerator,
  type: ArtifactType,
): Promise<{ session: Session; result: ArtifactResult }> {
  const logger = getLogger();
  logger.info(`artifact pipeline: starting '${type}' generation (session ${session.id})`);

  const updatedSession = transitionToArtifactStage(session, type);

  logger.info(`artifact pipeline: invoking generator for '${type}'`);
  const result = await generator.generate(updatedSession, provider);

  logger.info(`artifact pipeline: '${type}' generation complete (session ${session.id})`);
  return { session: updatedSession, result };
}
