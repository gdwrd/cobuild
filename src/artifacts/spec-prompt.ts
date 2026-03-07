import type { ModelMessage } from '../interview/controller.js';
import type { Session } from '../session/session.js';
import { getTranscript } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export const SPEC_SYSTEM_PROMPT = `You are an expert software architect writing a project specification document.
You will be given a transcript of a discovery interview and must produce a comprehensive Markdown specification.

The specification MUST include these sections (use these exact headings):
- ## Project Overview
- ## Functional Requirements
- ## Acceptance Criteria

Additional sections are encouraged (e.g. Technical Constraints, Integrations, Non-Functional Requirements).

Rules:
- Write in clear, professional technical language.
- Base the spec exclusively on information from the interview transcript.
- Do not ask questions or add commentary outside the document.
- Output only the Markdown document — no preamble, no explanation.`;

export function formatTranscriptForPrompt(session: Session): string {
  const transcript = getTranscript(session);
  if (transcript.length === 0) {
    return '(no interview transcript available)';
  }
  const lines = transcript.map((msg) => {
    const speaker = msg.role === 'user' ? 'User' : 'Interviewer';
    return `${speaker}: ${msg.content}`;
  });
  return lines.join('\n\n');
}

export function buildSpecMessages(session: Session): ModelMessage[] {
  const transcriptText = formatTranscriptForPrompt(session);
  const userMessage = `Here is the discovery interview transcript:\n\n${transcriptText}\n\nPlease write the project specification document now.`;
  return [
    { role: 'system', content: SPEC_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
}

export interface SpecPromptMetadata {
  messageCount: number;
  estimatedTokens: number;
  transcriptTurns: number;
}

export function getSpecPromptMetadata(session: Session, messages: ModelMessage[]): SpecPromptMetadata {
  const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
  return {
    messageCount: messages.length,
    estimatedTokens,
    transcriptTurns: getTranscript(session).length,
  };
}

export function logSpecPromptMetadata(session: Session, messages: ModelMessage[]): void {
  const logger = getLogger();
  const meta = getSpecPromptMetadata(session, messages);
  logger.info(
    `spec prompt: ${meta.messageCount} messages, ~${meta.estimatedTokens} estimated tokens, ${meta.transcriptTurns} transcript turns (session ${session.id})`,
  );
}
