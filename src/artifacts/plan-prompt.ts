import type { ModelMessage } from '../interview/controller.js';
import type { Session } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export const PLAN_SYSTEM_PROMPT = `You are an expert software architect writing a high-level development plan.
You will be given a project specification and an architecture document, and must produce a comprehensive Markdown development plan.

The plan MUST contain between 4 and 8 sequential phases. Each phase MUST include these fields (use these exact headings within each phase section):
- ### Title
- ### Goal
- ### Scope
- ### Deliverables
- ### Dependencies
- ### Acceptance Criteria

Use a top-level ## Phase N: <title> heading for each phase (e.g. ## Phase 1: Foundation).

Rules:
- Write in clear, professional technical language.
- Base the plan exclusively on the provided specification and architecture documents.
- Phases must be ordered sequentially; later phases may depend on earlier ones.
- Do not ask questions or add commentary outside the document.
- Output only the Markdown document — no preamble, no explanation.`;

export function buildPlanMessages(session: Session): ModelMessage[] {
  const specContent = session.specArtifact?.content ?? '(no spec available)';
  const archContent = session.architectureArtifact?.content ?? '(no architecture available)';
  const userMessage =
    `Here is the project specification:\n\n${specContent}\n\n` +
    `Here is the architecture document:\n\n${archContent}\n\n` +
    `Please write the high-level development plan now.`;
  return [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
}

export interface PlanPromptMetadata {
  messageCount: number;
  estimatedTokens: number;
  specLength: number;
  archLength: number;
}

export function getPlanPromptMetadata(session: Session, messages: ModelMessage[]): PlanPromptMetadata {
  const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
  return {
    messageCount: messages.length,
    estimatedTokens,
    specLength: session.specArtifact?.content.length ?? 0,
    archLength: session.architectureArtifact?.content.length ?? 0,
  };
}

export function logPlanPromptMetadata(session: Session, messages: ModelMessage[]): void {
  const logger = getLogger();
  const meta = getPlanPromptMetadata(session, messages);
  logger.info(
    `plan prompt: ${meta.messageCount} messages, ~${meta.estimatedTokens} estimated tokens, spec length=${meta.specLength} chars, arch length=${meta.archLength} chars (session ${session.id})`,
  );
}
