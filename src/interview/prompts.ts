import type { ModelMessage } from './controller.js';

export const MAX_PROMPT_TOKENS = 8000;

export const INTERVIEW_SYSTEM_PROMPT = `You are an expert software architect conducting a structured discovery interview.
Your goal is to gather enough information to write a complete technical specification for the user's project.

Rules:
- Ask exactly ONE question per response.
- Questions should be specific and build on previous answers.
- Cover: purpose, target users, core features, tech preferences, constraints, integrations, and success criteria.
- When you have enough information to write a comprehensive spec (typically 8-15 questions), include [INTERVIEW_COMPLETE] at the end of your final message.
- Do not include [INTERVIEW_COMPLETE] until you genuinely have enough information.
- Keep questions concise and conversational.`;

export function buildInterviewSystemPrompt(projectIdea: string): string {
  if (!projectIdea) return INTERVIEW_SYSTEM_PROMPT;
  return `${INTERVIEW_SYSTEM_PROMPT}

The user's project idea: ${projectIdea}`;
}

export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokenCount(messages: ModelMessage[]): number {
  // Add 4 tokens per message for role/formatting overhead
  return messages.reduce((sum, m) => sum + estimateTokenCount(m.content) + 4, 0);
}

export function isPromptTooLarge(messages: ModelMessage[]): boolean {
  return estimateMessagesTokenCount(messages) > MAX_PROMPT_TOKENS;
}

