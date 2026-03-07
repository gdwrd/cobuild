import type { Session, PlanPhase } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

const MIN_PHASES = 4;
const MAX_PHASES = 8;

export class PhaseMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhaseMetadataError';
  }
}

export interface PhaseIterator {
  phases: PlanPhase[];
  totalCount: number;
}

export function loadAndValidatePhases(session: Session): PhaseIterator {
  const logger = getLogger();

  const phases = session.extractedPhases;

  if (!phases || phases.length === 0) {
    logger.error(`dev-plan phases: no phase metadata available (session ${session.id})`);
    throw new PhaseMetadataError('No phase metadata available in session');
  }

  if (phases.length < MIN_PHASES || phases.length > MAX_PHASES) {
    logger.error(
      `dev-plan phases: invalid phase count ${phases.length}, expected ${MIN_PHASES}–${MAX_PHASES} (session ${session.id})`,
    );
    throw new PhaseMetadataError(
      `Phase count ${phases.length} is outside allowed range ${MIN_PHASES}–${MAX_PHASES}`,
    );
  }

  logger.info(
    `dev-plan phases: initialized ${phases.length} phases for sequential generation (session ${session.id})`,
  );

  return {
    phases: [...phases],
    totalCount: phases.length,
  };
}
