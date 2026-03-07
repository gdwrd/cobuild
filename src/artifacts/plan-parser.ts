import { getLogger } from '../logging/logger.js';
import type { PlanPhase } from '../session/session.js';

const PHASE_PATTERN = /^#{1,3}\s+Phase\s+(\d+)[:\s]+(.+)/gim;

const SECTION_PATTERNS: Array<{ field: keyof Omit<PlanPhase, 'number' | 'title'>; pattern: RegExp }> =
  [
    { field: 'goal', pattern: /^#{2,4}\s+goal\b/im },
    { field: 'scope', pattern: /^#{2,4}\s+scope\b/im },
    { field: 'deliverables', pattern: /^#{2,4}\s+deliverables?\b/im },
    { field: 'dependencies', pattern: /^#{2,4}\s+dependencies\b/im },
    { field: 'acceptanceCriteria', pattern: /^#{2,4}\s+acceptance\s+criteria\b/im },
  ];

interface PhaseMatch {
  number: number;
  title: string;
  startIndex: number;
}

function findPhaseMatches(content: string): PhaseMatch[] {
  const matches: PhaseMatch[] = [];
  const pattern = new RegExp(PHASE_PATTERN.source, PHASE_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    matches.push({
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      startIndex: match.index,
    });
  }
  return matches;
}

function extractSectionContent(phaseContent: string, sectionPattern: RegExp): string {
  const sectionMatch = sectionPattern.exec(phaseContent);
  if (!sectionMatch) return '';

  const afterHeader = phaseContent.slice(sectionMatch.index + sectionMatch[0].length);
  const nextHeadingMatch = /^#{2,4}\s+/m.exec(afterHeader);
  const end = nextHeadingMatch !== null ? nextHeadingMatch.index : afterHeader.length;
  return afterHeader.slice(0, end).trim();
}

export function extractPhases(content: string): PlanPhase[] {
  const logger = getLogger();
  const phaseMatches = findPhaseMatches(content);

  if (phaseMatches.length === 0) {
    logger.warn('plan parser: no phases found in content');
    return [];
  }

  const phases: PlanPhase[] = [];

  for (let i = 0; i < phaseMatches.length; i++) {
    const phaseMatch = phaseMatches[i];
    const start = phaseMatch.startIndex;
    const end = i + 1 < phaseMatches.length ? phaseMatches[i + 1].startIndex : content.length;
    const phaseContent = content.slice(start, end);

    const phase: PlanPhase = {
      number: phaseMatch.number,
      title: phaseMatch.title,
      goal: '',
      scope: '',
      deliverables: '',
      dependencies: '',
      acceptanceCriteria: '',
    };

    for (const { field, pattern } of SECTION_PATTERNS) {
      phase[field] = extractSectionContent(phaseContent, pattern);
    }

    phases.push(phase);
    logger.debug(`plan parser: extracted Phase ${phaseMatch.number}: ${phaseMatch.title}`);
  }

  logger.info(`plan parser: extracted ${phases.length} phases from plan`);
  return phases;
}
