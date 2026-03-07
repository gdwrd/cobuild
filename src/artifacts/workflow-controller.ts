import type { Session } from '../session/session.js';
import type { ModelProvider } from '../interview/controller.js';
import type { ArtifactGenerator } from './generator.js';
import {
  loadSession,
  persistWorkflowDecision,
  persistDevPlansDecision,
  persistDevPlanStage,
  persistArchitectureArtifact,
  completeArchitectureStage,
  persistPlanArtifact,
  completePlanStage,
  persistExtractedPhases,
} from '../session/session.js';
import { runArtifactPipeline } from './generator.js';
import { extractPhases } from './plan-parser.js';
import { getLogger } from '../logging/logger.js';

export type PostSpecStage =
  | 'asking-architecture'
  | 'generating-architecture'
  | 'asking-plan'
  | 'generating-plan'
  | 'asking-dev-plans'
  | 'complete'
  | 'terminated';

export interface PostSpecWorkflowOptions {
  architectureGenerator: ArtifactGenerator;
  planGenerator: ArtifactGenerator;
  onDecision: (question: string) => Promise<boolean>;
  writeArtifactFile: (content: string, workingDirectory: string, type: 'architecture' | 'plan') => string;
  onStageUpdate?: (stage: PostSpecStage) => void;
}

export interface PostSpecWorkflowResult {
  terminatedAt?: 'architecture-decision' | 'plan-decision' | 'dev-plans-decision';
  architectureFilePath?: string;
  planFilePath?: string;
  finalSession: Session;
}

function notifyStage(options: PostSpecWorkflowOptions, stage: PostSpecStage): void {
  options.onStageUpdate?.(stage);
  getLogger().info(`post-spec workflow: stage=${stage}`);
}

export async function runPostSpecWorkflow(
  session: Session,
  provider: ModelProvider,
  options: PostSpecWorkflowOptions,
): Promise<PostSpecWorkflowResult> {
  const logger = getLogger();
  logger.info(`post-spec workflow: starting (session ${session.id})`);

  // Step 1: Ask about architecture generation
  notifyStage(options, 'asking-architecture');
  const wantsArchitecture = await options.onDecision(
    'Generate architecture document?',
  );
  let currentSession = persistWorkflowDecision(session, 'architecture', wantsArchitecture);

  if (!wantsArchitecture) {
    logger.info(`post-spec workflow: user declined architecture generation, terminating (session ${session.id})`);
    notifyStage(options, 'terminated');
    return { terminatedAt: 'architecture-decision', finalSession: currentSession };
  }

  // Step 2: Generate architecture
  notifyStage(options, 'generating-architecture');
  const { session: afterArchPipeline, result: archResult } = await runArtifactPipeline(
    currentSession,
    provider,
    options.architectureGenerator,
    'architecture',
  );
  const architectureFilePath = options.writeArtifactFile(
    archResult.content,
    afterArchPipeline.workingDirectory,
    'architecture',
  );
  // Reload from disk to pick up fields written by the generator (e.g. architectureGenerationAttempts)
  const freshArchSession = loadSession(afterArchPipeline.id) ?? afterArchPipeline;
  currentSession = persistArchitectureArtifact(freshArchSession, archResult.content, architectureFilePath);
  currentSession = completeArchitectureStage(currentSession);
  logger.info(`post-spec workflow: architecture generation complete, saved to ${architectureFilePath} (session ${session.id})`);

  // Step 3: Ask about plan generation
  notifyStage(options, 'asking-plan');
  const wantsPlan = await options.onDecision('Generate high-level development plan?');
  currentSession = persistWorkflowDecision(currentSession, 'plan', wantsPlan);

  if (!wantsPlan) {
    logger.info(`post-spec workflow: user declined plan generation, terminating (session ${session.id})`);
    notifyStage(options, 'terminated');
    return {
      terminatedAt: 'plan-decision',
      architectureFilePath,
      finalSession: currentSession,
    };
  }

  // Step 4: Generate high-level plan
  notifyStage(options, 'generating-plan');
  const { session: afterPlanPipeline, result: planResult } = await runArtifactPipeline(
    currentSession,
    provider,
    options.planGenerator,
    'plan',
  );
  const planFilePath = options.writeArtifactFile(
    planResult.content,
    afterPlanPipeline.workingDirectory,
    'plan',
  );
  // Reload from disk to pick up fields written by the generator (e.g. planGenerationAttempts)
  const freshPlanSession = loadSession(afterPlanPipeline.id) ?? afterPlanPipeline;
  currentSession = persistPlanArtifact(freshPlanSession, planResult.content, planFilePath);
  const phases = extractPhases(planResult.content);
  currentSession = persistExtractedPhases(currentSession, phases);
  currentSession = completePlanStage(currentSession);
  logger.info(`post-spec workflow: plan generation complete, saved to ${planFilePath} (session ${session.id})`);

  // Step 5: Ask about dev plan generation
  notifyStage(options, 'asking-dev-plans');
  const wantsDevPlans = await options.onDecision('Generate per-phase dev plans?');
  currentSession = persistDevPlansDecision(currentSession, wantsDevPlans);

  if (!wantsDevPlans) {
    logger.info(`post-spec workflow: user declined dev plan generation, terminating (session ${session.id})`);
    notifyStage(options, 'terminated');
    return {
      terminatedAt: 'dev-plans-decision',
      architectureFilePath,
      planFilePath,
      finalSession: currentSession,
    };
  }

  logger.info(`post-spec workflow: dev plan generation stage starting (session ${session.id})`);
  // Persist dev-plans stage immediately so the session is resumable if the process exits
  // before the dev-plan loop starts.
  currentSession = persistDevPlanStage(currentSession);
  notifyStage(options, 'complete');
  return {
    architectureFilePath,
    planFilePath,
    finalSession: currentSession,
  };
}
