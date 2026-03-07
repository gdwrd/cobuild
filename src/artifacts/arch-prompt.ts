import type { ModelMessage } from '../interview/controller.js';
import type { Session } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export const ARCH_SYSTEM_PROMPT = `You are an expert software architect writing an architecture document.
You will be given a project specification and must produce a comprehensive Markdown architecture document.

The architecture document MUST include these sections (use these exact headings):
- ## System Components
- ## Data Flow
- ## External Integrations
- ## Storage Choices
- ## Deployment and Runtime Model
- ## Security Considerations
- ## Failure Handling

Rules:
- Write in clear, professional technical language.
- Base the architecture exclusively on the provided project specification.
- Do not ask questions or add commentary outside the document.
- Output only the Markdown document — no preamble, no explanation.`;

export function buildArchMessages(session: Session): ModelMessage[] {
  const specContent = session.specArtifact?.content ?? '(no spec available)';
  const userMessage = `Here is the project specification:\n\n${specContent}\n\nPlease write the architecture document now.`;
  return [
    { role: 'system', content: ARCH_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
}

export interface ArchPromptMetadata {
  messageCount: number;
  estimatedTokens: number;
  specLength: number;
}

export function getArchPromptMetadata(session: Session, messages: ModelMessage[]): ArchPromptMetadata {
  const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
  return {
    messageCount: messages.length,
    estimatedTokens,
    specLength: session.specArtifact?.content.length ?? 0,
  };
}

export function logArchPromptMetadata(session: Session, messages: ModelMessage[]): void {
  const logger = getLogger();
  const meta = getArchPromptMetadata(session, messages);
  logger.info(
    `arch prompt: ${meta.messageCount} messages, ~${meta.estimatedTokens} estimated tokens, spec length=${meta.specLength} chars (session ${session.id})`,
  );
}
