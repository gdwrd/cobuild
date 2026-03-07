import type { ModelMessage } from '../interview/controller.js';
import type { Session, PlanPhase } from '../session/session.js';
import { getLogger } from '../logging/logger.js';

export const DEV_PLAN_SYSTEM_PROMPT = `You are an expert software engineer writing a detailed development plan for a single phase of a larger project.
You will be given a project specification, architecture document, high-level plan, any previously generated phase plans, and the metadata for the current phase.
Your task is to produce a complete, actionable development plan for ONLY the current phase.

The plan MUST follow this exact structure:

# Plan: Phase <N>: <phase title>

## Overview

A concise paragraph describing the phase's purpose and what it will accomplish.

## Validation Commands

A list of shell commands that can be run to verify the phase's work is correct (e.g. build, test, lint commands).

### Task 1: <task title>

- [ ] First action item
- [ ] Second action item

### Task 2: <task title>

- [ ] First action item

(continue for all tasks)

Rules:
- Use "### Task N:" headings for all task sections (not sub-phases or iterations unless clearly appropriate).
- Every task section MUST contain at least one Markdown checkbox item starting with "- [ ]".
- Do NOT include code snippets, code blocks, or example code in the plan.
- Cover only the work required for the current phase. Do not duplicate work from previous phases.
- Be specific and actionable. Each checkbox should describe a concrete implementation step.
- Do not ask questions or add commentary outside the document.
- Output only the Markdown document — no preamble, no explanation.`;

export function buildDevPlanMessages(
  session: Session,
  phase: PlanPhase,
  previousDevPlans: string[],
): ModelMessage[] {
  const specContent = session.specArtifact?.content ?? '(no spec available)';
  const archContent = session.architectureArtifact?.content ?? '(no architecture available)';
  const planContent = session.planArtifact?.content ?? '(no high-level plan available)';

  const phaseMetadata =
    `Phase Number: ${phase.number}\n` +
    `Title: ${phase.title}\n` +
    `Goal: ${phase.goal}\n` +
    `Scope: ${phase.scope}\n` +
    `Deliverables: ${phase.deliverables}\n` +
    `Dependencies: ${phase.dependencies}\n` +
    `Acceptance Criteria: ${phase.acceptanceCriteria}`;

  let userMessage =
    `Here is the project specification:\n\n${specContent}\n\n` +
    `Here is the architecture document:\n\n${archContent}\n\n` +
    `Here is the high-level development plan:\n\n${planContent}\n\n`;

  if (previousDevPlans.length > 0) {
    userMessage += `Here are the previously generated phase plans:\n\n`;
    for (let i = 0; i < previousDevPlans.length; i++) {
      userMessage += `--- Phase ${i + 1} Plan ---\n${previousDevPlans[i]}\n\n`;
    }
  }

  userMessage +=
    `Here is the metadata for the current phase:\n\n${phaseMetadata}\n\n` +
    `Please write the development plan for Phase ${phase.number}: ${phase.title} now.`;

  return [
    { role: 'system', content: DEV_PLAN_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
}

export interface DevPlanPromptMetadata {
  messageCount: number;
  estimatedTokens: number;
  specLength: number;
  archLength: number;
  planLength: number;
  phaseNumber: number;
  previousDevPlanCount: number;
}

export function getDevPlanPromptMetadata(
  session: Session,
  phase: PlanPhase,
  messages: ModelMessage[],
  previousDevPlans: string[],
): DevPlanPromptMetadata {
  const estimatedTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 4, 0);
  return {
    messageCount: messages.length,
    estimatedTokens,
    specLength: session.specArtifact?.content.length ?? 0,
    archLength: session.architectureArtifact?.content.length ?? 0,
    planLength: session.planArtifact?.content.length ?? 0,
    phaseNumber: phase.number,
    previousDevPlanCount: previousDevPlans.length,
  };
}

export function logDevPlanPromptMetadata(
  session: Session,
  phase: PlanPhase,
  messages: ModelMessage[],
  previousDevPlans: string[],
): void {
  const logger = getLogger();
  const meta = getDevPlanPromptMetadata(session, phase, messages, previousDevPlans);
  logger.info(
    `dev-plan prompt: phase ${meta.phaseNumber}, ${meta.messageCount} messages, ~${meta.estimatedTokens} estimated tokens, spec=${meta.specLength} chars, arch=${meta.archLength} chars, plan=${meta.planLength} chars, prior plans=${meta.previousDevPlanCount} (session ${session.id})`,
  );
}
