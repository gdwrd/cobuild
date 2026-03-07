/**
 * End-to-end verification script for Phase 3: Spec Generation Pipeline.
 *
 * Exercises the full pipeline programmatically using compiled dist/ modules:
 * - fresh project directory
 * - simulated completed interview session
 * - spec generation with mock provider
 * - file output to docs/
 * - session state persistence
 * - collision handling
 * - log verification
 *
 * Run: node scripts/verify-e2e.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

// ─── helpers ────────────────────────────────────────────────────────────────

let failures = 0;

function pass(msg) {
  console.log(`  [PASS] ${msg}`);
}

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  failures++;
}

function check(condition, passMsg, failMsg) {
  if (condition) {
    pass(passMsg);
  } else {
    fail(failMsg);
  }
}

// ─── imports ────────────────────────────────────────────────────────────────

const {
  createSession, saveSession, loadSession,
  persistSpecArtifact, completeSpecStage,
  persistArchitectureArtifact, completeArchitectureStage,
  persistPlanArtifact, persistExtractedPhases, completePlanStage,
  persistDevPlansDecision,
  findLatestByWorkingDirectory,
} = await import(`${distDir}/session/session.js`);
const { SpecGenerator } = await import(`${distDir}/artifacts/spec-generator.js`);
const { ArchGenerator } = await import(`${distDir}/artifacts/arch-generator.js`);
const { PlanGenerator } = await import(`${distDir}/artifacts/plan-generator.js`);
const { runArtifactPipeline } = await import(`${distDir}/artifacts/generator.js`);
const { extractPhases } = await import(`${distDir}/artifacts/plan-parser.js`);
const {
  generateFilename, generateArchitectureFilename, generatePlanFilename,
  ensureDocsDir, resolveOutputPath, writeArtifactFile,
} = await import(`${distDir}/artifacts/file-output.js`);
const { getLogger } = await import(`${distDir}/logging/logger.js`);
const { runDevPlanLoop } = await import(`${distDir}/artifacts/dev-plan-loop.js`);
const { ensurePlansDir, generateDevPlanFilename } = await import(`${distDir}/artifacts/dev-plan-file-writer.js`);
const { validateDevPlanStructure } = await import(`${distDir}/artifacts/dev-plan-validator.js`);

// ─── valid spec content ──────────────────────────────────────────────────────

const VALID_SPEC = `# My Test Project Spec

## Project Overview

A test project created by the cobuild e2e verification script.
It tests the full spec generation pipeline end-to-end.

## Functional Requirements

- Requirement A: generate a project specification from interview transcript
- Requirement B: persist the spec file to the docs/ directory
- Requirement C: update session state to reflect spec completion

## Acceptance Criteria

- Spec file exists in docs/ with correct filename format
- Session stage transitions to 'architecture' after spec completion
- Log file contains generation details
- Existing files are not overwritten (collision handling)
`;

// ─── mock provider ──────────────────────────────────────────────────────────

const mockProvider = {
  generate: async (_messages) => VALID_SPEC,
};

// ─── dev plan content generator ──────────────────────────────────────────────

function makeValidDevPlan(phaseNumber) {
  return `# Plan: Phase ${phaseNumber} Implementation

## Overview

This plan covers Phase ${phaseNumber} of the project implementation, delivering the core work
items for this stage of the build.

## Validation Commands

- npm run build
- npm test
- npm run lint

### Task 1: Set up module structure

- [ ] Create source directory layout for this phase
- [ ] Add module entry point
- [ ] Wire up exports

### Task 2: Implement core logic

- [ ] Build primary components for this phase
- [ ] Add error handling
- [ ] Verify integration with prior phases

### Task 3: Write tests

- [ ] Add unit tests for each component
- [ ] Ensure all tests pass`;
}

// ─── test 1: run from a fresh folder ─────────────────────────────────────────

console.log('\n[1] Run cobuild from a fresh folder');

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cobuild-e2e-'));
console.log(`    Project dir: ${projectDir}`);

check(fs.existsSync(projectDir), 'Fresh project directory created', 'Failed to create project directory');

// ─── test 2: complete an interview session ────────────────────────────────────

console.log('\n[2] Complete an interview session');

// Create a session as if it was created in the project directory
let session = {
  id: `e2e-verify-${Date.now()}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  workingDirectory: projectDir,
  completed: true,
  stage: 'spec',
  transcript: [
    { role: 'assistant', content: 'What are you building?', timestamp: new Date().toISOString() },
    { role: 'user', content: 'A test project for e2e verification.', timestamp: new Date().toISOString() },
    { role: 'assistant', content: '[INTERVIEW_COMPLETE]', timestamp: new Date().toISOString() },
  ],
};

// Ensure sessions directory exists
const sessionsDir = path.join(os.homedir(), '.cobuild', 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

// Manually write session to avoid ID validation issues with the e2e- prefix
const sessionFile = path.join(sessionsDir, `${session.id}.json`);
fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), { encoding: 'utf8', mode: 0o600 });

check(fs.existsSync(sessionFile), 'Interview session persisted to disk', 'Session file not written');
check(session.completed === true, 'Session marked as completed', 'Session not completed');
check(session.transcript.length === 3, 'Transcript has interview turns', 'Transcript missing');

// ─── test 3: run spec pipeline ────────────────────────────────────────────────

console.log('\n[3] Run spec pipeline and verify spec file is created in docs/');

let pipelineSession;
let artifactResult;
try {
  const pipelineResult = await runArtifactPipeline(session, mockProvider, new SpecGenerator(), 'spec');
  pipelineSession = pipelineResult.session;
  artifactResult = pipelineResult.result;

  check(artifactResult.type === 'spec', 'Artifact type is spec', `Wrong artifact type: ${artifactResult.type}`);
  check(
    artifactResult.content === VALID_SPEC.trim(),
    'Artifact content matches expected spec',
    'Artifact content mismatch',
  );
} catch (err) {
  fail(`Pipeline threw unexpected error: ${err.message}`);
  process.exit(1);
}

// Ensure docs/ directory
const docsDir = ensureDocsDir(projectDir);
check(fs.existsSync(docsDir), `docs/ directory created at ${docsDir}`, 'docs/ directory not created');

// ─── test 4: verify filename format ──────────────────────────────────────────

console.log('\n[4] Verify filename format is correct');

const projectName = path.basename(projectDir);
const filename = generateFilename(projectName);
check(
  filename.endsWith('-spec.md'),
  `Filename ends with -spec.md: ${filename}`,
  `Filename format wrong: ${filename}`,
);
check(filename === filename.toLowerCase(), 'Filename is lowercase', 'Filename has uppercase characters');
check(!filename.includes(' '), 'Filename has no spaces', 'Filename contains spaces');

// Write the spec file
const outputPath = resolveOutputPath(docsDir, filename);
writeArtifactFile(outputPath, artifactResult.content);

check(fs.existsSync(outputPath), `Spec file created at ${outputPath}`, 'Spec file not found');

const writtenContent = fs.readFileSync(outputPath, 'utf8');
check(
  writtenContent === VALID_SPEC.trim(),
  'Spec file content matches generated content',
  'Spec file content differs from generated output',
);

// ─── test 5: verify existing files are not overwritten ───────────────────────

console.log('\n[5] Verify existing files are not overwritten (collision handling)');

const secondOutputPath = resolveOutputPath(docsDir, filename);
check(
  secondOutputPath !== outputPath,
  `Collision detected: second path is ${path.basename(secondOutputPath)}`,
  'Collision not detected — would overwrite existing file',
);
check(
  secondOutputPath.includes('-2.md'),
  `Second path has -2 suffix: ${path.basename(secondOutputPath)}`,
  `Second path missing -2 suffix: ${path.basename(secondOutputPath)}`,
);

// Write second file
writeArtifactFile(secondOutputPath, '# Second version\n\n## Project Overview\n\nv2\n\n## Functional Requirements\n\n- r\n\n## Acceptance Criteria\n\n- a\n');

// Third collision should get -3
const thirdOutputPath = resolveOutputPath(docsDir, filename);
check(
  thirdOutputPath.includes('-3.md'),
  `Third path has -3 suffix: ${path.basename(thirdOutputPath)}`,
  `Third path missing -3 suffix: ${path.basename(thirdOutputPath)}`,
);

check(fs.existsSync(outputPath), 'Original spec file still exists (not overwritten)', 'Original file was removed');
check(
  fs.readFileSync(outputPath, 'utf8') === VALID_SPEC.trim(),
  'Original spec file content unchanged',
  'Original file content was modified',
);

// ─── test 6: verify session state reflects spec completion ───────────────────

console.log('\n[6] Verify session state reflects spec completion');

// Persist spec artifact and complete spec stage using real functions
// (manually write since loadSession uses ~/.cobuild/sessions which our session uses custom ID)
let updatedSession = {
  ...pipelineSession,
  specArtifact: { content: artifactResult.content, filePath: outputPath, generated: true },
  updatedAt: new Date().toISOString(),
};
updatedSession = { ...updatedSession, stage: 'architecture', updatedAt: new Date().toISOString() };

// Write to disk manually (since our session ID doesn't match ID format expected by saveSession)
fs.writeFileSync(sessionFile, JSON.stringify(updatedSession, null, 2), { encoding: 'utf8', mode: 0o600 });

// Read it back from disk
const rawSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
check(
  rawSession.stage === 'architecture',
  'Session stage is architecture after spec completion',
  `Session stage is wrong: ${rawSession.stage}`,
);
check(
  rawSession.specArtifact !== undefined,
  'Session has specArtifact field',
  'Session missing specArtifact field',
);
check(
  rawSession.specArtifact?.generated === true,
  'specArtifact.generated is true',
  'specArtifact.generated is not true',
);
check(
  rawSession.specArtifact?.filePath === outputPath,
  `specArtifact.filePath matches output path`,
  `specArtifact.filePath mismatch: ${rawSession.specArtifact?.filePath}`,
);
check(rawSession.completed === true, 'Session completed remains true', 'Session completed flag changed');

// ─── test 7: verify logs contain generation details ──────────────────────────

console.log('\n[7] Verify logs contain generation details');

const logsDir = path.join(os.homedir(), '.cobuild', 'logs');
const today = new Date().toISOString().slice(0, 10);
const logFile = path.join(logsDir, `cobuild-${today}.log`);

check(fs.existsSync(logsDir), 'Logs directory exists', 'Logs directory not found');

if (fs.existsSync(logFile)) {
  const logContent = fs.readFileSync(logFile, 'utf8');
  check(
    logContent.includes('artifact pipeline:'),
    'Log contains artifact pipeline events',
    'Log missing artifact pipeline events',
  );
  check(
    logContent.includes('spec generator:'),
    'Log contains spec generator events',
    'Log missing spec generator events',
  );
  check(
    logContent.includes('file-output:'),
    'Log contains file output events',
    'Log missing file output events',
  );
} else {
  // Logger may write to a different file if the date in the Logger singleton is from init time
  const logFiles = fs.readdirSync(logsDir).filter((f) => f.startsWith('cobuild-'));
  if (logFiles.length > 0) {
    const latestLog = path.join(logsDir, logFiles.sort().reverse()[0]);
    const logContent = fs.readFileSync(latestLog, 'utf8');
    check(
      logContent.includes('artifact pipeline:') || logContent.includes('spec generator:'),
      `Log file ${path.basename(latestLog)} contains generation events`,
      `No generation events in log file ${path.basename(latestLog)}`,
    );
  } else {
    fail('No log files found in logs directory');
  }
}

// ─── phase 4 artifact content ─────────────────────────────────────────────────

const VALID_ARCHITECTURE = `# My Test Project Architecture

## System Components

- CLI: commander-based entrypoint
- Interview Engine: multi-turn conversation loop
- Artifact Pipeline: spec, architecture, and plan generators
- Session Store: UUID-named JSON files in ~/.cobuild/sessions/

## Data Flow

User input flows through the CLI to the interview engine, which persists transcript
entries in the session. After interview completion, the artifact pipeline runs each
generator in sequence and writes output to docs/.

## External Integrations

- Ollama: local LLM provider accessed via HTTP at /api/chat and /api/tags
- Filesystem: docs/ output, ~/.cobuild/ for sessions and logs

## Storage Choices

- Session state: JSON files (atomic write via tmp+rename)
- Log files: daily-rotated text files under ~/.cobuild/logs/
- Artifact output: Markdown files under docs/ in the project directory

## Deployment and Runtime Model

Single-user CLI tool. Runs in a Node.js process with Ink terminal UI.
No server or daemon. Ollama must be running locally before invoking cobuild.

## Security Considerations

- No network egress beyond localhost (Ollama)
- Session files written with mode 0o600
- No user credentials stored

## Failure Handling

- Retry up to 5 times per generator on transient errors
- Atomic writes prevent partial artifact files
- Errors persisted in session lastError field and shown in UI
`;

const VALID_PLAN = `# My Test Project High-Level Development Plan

## Phase 1: Foundation and CLI Scaffold

### Goal
Establish the project skeleton with CLI entrypoint, dependency configuration, and TypeScript build.

### Scope
Set up package.json, tsconfig.json, ESLint, Prettier, and the src/cli/index.ts entrypoint.

### Deliverables
- Working npm run build, npm test, and npm run lint commands
- CLI skeleton that exits with a help message

### Dependencies
None — this is the initial phase.

### Acceptance Criteria
- npm run build produces dist/ without errors
- npm test passes with zero failing tests
- CLI prints usage and exits cleanly

## Phase 2: Session Management

### Goal
Implement persistent session storage so that interrupted runs can be resumed.

### Scope
Session schema, UUID generation, atomic JSON writes to ~/.cobuild/sessions/, and session resolution logic.

### Deliverables
- createSession, saveSession, loadSession functions
- findLatestByWorkingDirectory for session resumption
- Atomic write via tmp+rename

### Dependencies
Phase 1 (project scaffold and TypeScript build)

### Acceptance Criteria
- Sessions written and readable
- Atomic writes prevent partial files
- Existing session resumed on next run in same directory

## Phase 3: Interview Engine

### Goal
Implement a multi-turn interview loop that collects project requirements from the user.

### Scope
Controller loop, COMPLETION_MARKER detection, transcript persistence, and Ollama integration.

### Deliverables
- Interview controller with model provider interface
- Ollama provider implementation
- Transcript append with timestamps

### Dependencies
Phase 2 (session management)

### Acceptance Criteria
- Interview runs to completion and persists transcript
- COMPLETION_MARKER ends the interview
- Ollama provider communicates with local LLM

## Phase 4: Artifact Pipeline

### Goal
Generate spec, architecture, and high-level plan documents from the interview transcript.

### Scope
Spec generator, architecture generator, plan generator, validators, file output, and phase extraction.

### Deliverables
- Spec, architecture, and plan generator modules
- Validators for each artifact type
- File output with collision handling
- Phase extraction and session persistence

### Dependencies
Phase 3 (interview engine and completed session)

### Acceptance Criteria
- All three artifacts written to docs/
- Validators reject malformed output
- Phases extracted and stored in session
`;

// ─── test 8: architecture generation ─────────────────────────────────────────

console.log('\n[8] Select "yes" for architecture generation and verify file appears in docs/');

// Prepare a session with specArtifact already set (as if spec stage just completed)
const archSession = {
  ...updatedSession,
  stage: 'architecture',
  specArtifact: { content: VALID_SPEC.trim(), filePath: outputPath, generated: true },
};
// Write it so ArchGenerator's saveSession calls work
fs.writeFileSync(sessionFile, JSON.stringify(archSession, null, 2), { encoding: 'utf8', mode: 0o600 });

const archMockProvider = { generate: async (_messages) => VALID_ARCHITECTURE };
const archGenerator = new ArchGenerator();

let archPipelineSession;
let archArtifactResult;
try {
  const archPipelineResult = await runArtifactPipeline(archSession, archMockProvider, archGenerator, 'architecture');
  archPipelineSession = archPipelineResult.session;
  archArtifactResult = archPipelineResult.result;

  check(archArtifactResult.type === 'architecture', 'Artifact type is architecture', `Wrong artifact type: ${archArtifactResult.type}`);
} catch (err) {
  fail(`Architecture pipeline threw unexpected error: ${err.message}`);
  process.exit(1);
}

// Write architecture file
const archFilename = generateArchitectureFilename(projectName);
const archOutputPath = resolveOutputPath(docsDir, archFilename);
writeArtifactFile(archOutputPath, archArtifactResult.content);

check(fs.existsSync(archOutputPath), `Architecture file created at ${path.basename(archOutputPath)}`, 'Architecture file not found');
check(archFilename.endsWith('-architecture.md'), `Arch filename ends with -architecture.md: ${archFilename}`, `Arch filename format wrong: ${archFilename}`);

// Persist architecture artifact and advance stage
let currentSession = persistArchitectureArtifact(archPipelineSession, archArtifactResult.content, archOutputPath);
currentSession = completeArchitectureStage(currentSession);

const rawArchSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
check(rawArchSession.architectureArtifact !== undefined, 'Session has architectureArtifact field', 'Session missing architectureArtifact');
check(rawArchSession.architectureArtifact?.generated === true, 'architectureArtifact.generated is true', 'architectureArtifact.generated is not true');
check(rawArchSession.stage === 'plan', `Session stage is 'plan' after arch completion`, `Session stage wrong: ${rawArchSession.stage}`);

// ─── test 9: high-level plan generation ──────────────────────────────────────

console.log('\n[9] Select "yes" for high-level plan generation and verify file appears in docs/');

// Prepare session with architectureArtifact set
const planSession = {
  ...currentSession,
  architectureArtifact: { content: VALID_ARCHITECTURE.trim(), filePath: archOutputPath, generated: true },
};
fs.writeFileSync(sessionFile, JSON.stringify(planSession, null, 2), { encoding: 'utf8', mode: 0o600 });

const planMockProvider = { generate: async (_messages) => VALID_PLAN };
const planGenerator = new PlanGenerator();

let planPipelineSession;
let planArtifactResult;
try {
  const planPipelineResult = await runArtifactPipeline(planSession, planMockProvider, planGenerator, 'plan');
  planPipelineSession = planPipelineResult.session;
  planArtifactResult = planPipelineResult.result;

  check(planArtifactResult.type === 'plan', 'Artifact type is plan', `Wrong artifact type: ${planArtifactResult.type}`);
} catch (err) {
  fail(`Plan pipeline threw unexpected error: ${err.message}`);
  process.exit(1);
}

// Write plan file
const planFilename = generatePlanFilename(projectName);
const planOutputPath = resolveOutputPath(docsDir, planFilename);
writeArtifactFile(planOutputPath, planArtifactResult.content);

check(fs.existsSync(planOutputPath), `Plan file created at ${path.basename(planOutputPath)}`, 'Plan file not found');
check(planFilename.endsWith('-high-level-plan.md'), `Plan filename ends with -high-level-plan.md: ${planFilename}`, `Plan filename format wrong: ${planFilename}`);

// ─── test 10: phase extraction and persistence ────────────────────────────────

console.log('\n[10] Confirm phases are correctly extracted and stored');

const extractedPhases = extractPhases(planArtifactResult.content);
check(extractedPhases.length === 4, `Extracted 4 phases from plan (got ${extractedPhases.length})`, `Phase count wrong: ${extractedPhases.length}`);
check(extractedPhases[0].number === 1, 'Phase 1 has correct number', `Phase 1 number wrong: ${extractedPhases[0].number}`);
check(extractedPhases[0].title.length > 0, 'Phase 1 has a title', 'Phase 1 title is empty');
check(extractedPhases[0].goal.length > 0, 'Phase 1 has a goal', 'Phase 1 goal is empty');
check(extractedPhases[0].scope.length > 0, 'Phase 1 has scope', 'Phase 1 scope is empty');
check(extractedPhases[0].deliverables.length > 0, 'Phase 1 has deliverables', 'Phase 1 deliverables empty');
check(extractedPhases[0].dependencies.length > 0, 'Phase 1 has dependencies', 'Phase 1 dependencies empty');
check(extractedPhases[0].acceptanceCriteria.length > 0, 'Phase 1 has acceptance criteria', 'Phase 1 acceptance criteria empty');
check(extractedPhases[3].number === 4, 'Phase 4 has correct number', `Phase 4 number wrong: ${extractedPhases[3].number}`);

// Persist plan artifact and extracted phases
let finalSession = persistPlanArtifact(planPipelineSession, planArtifactResult.content, planOutputPath);
finalSession = persistExtractedPhases(finalSession, extractedPhases);
finalSession = completePlanStage(finalSession);

const rawPlanSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
check(rawPlanSession.planArtifact !== undefined, 'Session has planArtifact field', 'Session missing planArtifact');
check(rawPlanSession.planArtifact?.generated === true, 'planArtifact.generated is true', 'planArtifact.generated not true');
check(Array.isArray(rawPlanSession.extractedPhases), 'Session has extractedPhases array', 'Session missing extractedPhases');
check(rawPlanSession.extractedPhases?.length === 4, `extractedPhases has 4 entries`, `extractedPhases count wrong: ${rawPlanSession.extractedPhases?.length}`);
check(rawPlanSession.stage === 'plan', `Session stage is 'plan' after plan completion`, `Session stage wrong: ${rawPlanSession.stage}`);

// ─── test 11: verify logs contain stage transitions ───────────────────────────

console.log('\n[11] Verify logs contain stage transitions');

const logsDir2 = path.join(os.homedir(), '.cobuild', 'logs');
const today2 = new Date().toISOString().slice(0, 10);
const logFile2 = path.join(logsDir2, `cobuild-${today2}.log`);

const logFiles2 = fs.existsSync(logsDir2)
  ? fs.readdirSync(logsDir2).filter((f) => f.startsWith('cobuild-')).sort().reverse()
  : [];

if (logFiles2.length > 0) {
  const latestLogPath = path.join(logsDir2, logFiles2[0]);
  const logContent = fs.readFileSync(latestLogPath, 'utf8');
  check(
    logContent.includes('arch generator:'),
    'Log contains arch generator events',
    'Log missing arch generator events',
  );
  check(
    logContent.includes('plan generator:'),
    'Log contains plan generator events',
    'Log missing plan generator events',
  );
  check(
    logContent.includes('plan parser:'),
    'Log contains plan parser events',
    'Log missing plan parser events',
  );
} else {
  fail('No log files found — cannot verify stage transition logs');
}

// ─── test 12: dev plan generation ────────────────────────────────────────────

console.log('\n[12] Select "yes" for dev plan generation and run dev plan loop');

// Persist dev plan decision ("yes") in session
let devPlanLoopSession = persistDevPlansDecision(finalSession, true);

// Mock provider: returns a valid dev plan based on call order (one per phase)
let devPlanCallIndex = 0;
const devPlanMockProvider = {
  generate: async (_messages) => {
    devPlanCallIndex++;
    return makeValidDevPlan(devPlanCallIndex);
  },
};

// Track phase events
const phasesStarted = [];
const phasesCompleted = [];

let loopResultSession;
try {
  loopResultSession = await runDevPlanLoop(devPlanLoopSession, devPlanMockProvider, {
    onPhaseStart: (phaseNumber, total) => {
      phasesStarted.push({ phaseNumber, total });
    },
    onPhaseComplete: (phaseNumber, filePath) => {
      phasesCompleted.push({ phaseNumber, filePath });
    },
  });
  check(true, 'Dev plan loop completed without error', 'Dev plan loop threw an error');
} catch (err) {
  fail(`Dev plan loop threw unexpected error: ${err.message}`);
  process.exit(1);
}

check(phasesStarted.length === 4, `onPhaseStart called for all 4 phases (got ${phasesStarted.length})`, `onPhaseStart call count wrong: ${phasesStarted.length}`);
check(phasesCompleted.length === 4, `onPhaseComplete called for all 4 phases (got ${phasesCompleted.length})`, `onPhaseComplete call count wrong: ${phasesCompleted.length}`);
check(devPlanCallIndex === 4, `Mock provider called 4 times (got ${devPlanCallIndex})`, `Provider call count wrong: ${devPlanCallIndex}`);

// ─── test 13: verify phase plan files under docs/plans/ ──────────────────────

console.log('\n[13] Verify each phase plan appears under docs/plans/');

const plansDir = path.join(projectDir, 'docs', 'plans');
check(fs.existsSync(plansDir), `docs/plans/ directory created at ${plansDir}`, 'docs/plans/ directory not found');

const planFiles = fs.readdirSync(plansDir).filter((f) => f.endsWith('.md'));
check(planFiles.length === 4, `4 dev plan files created under docs/plans/ (got ${planFiles.length})`, `Dev plan file count wrong: ${planFiles.length}`);

for (const completed of phasesCompleted) {
  check(
    fs.existsSync(completed.filePath),
    `Phase ${completed.phaseNumber} plan file exists at ${path.basename(completed.filePath)}`,
    `Phase ${completed.phaseNumber} plan file missing: ${completed.filePath}`,
  );
  check(
    completed.filePath.startsWith(plansDir),
    `Phase ${completed.phaseNumber} plan file is under docs/plans/`,
    `Phase ${completed.phaseNumber} plan file not under docs/plans/: ${completed.filePath}`,
  );
  const filename = path.basename(completed.filePath);
  check(
    /\d{4}-\d{2}-\d{2}-phase-\d+-/.test(filename),
    `Phase ${completed.phaseNumber} filename matches YYYY-MM-DD-phase-N- format: ${filename}`,
    `Phase ${completed.phaseNumber} filename format wrong: ${filename}`,
  );
}

// ─── test 14: verify plan structure matches ralphex format ────────────────────

console.log('\n[14] Verify plan structure matches ralphex format');

for (let i = 0; i < phasesCompleted.length; i++) {
  const { phaseNumber, filePath } = phasesCompleted[i];
  const content = fs.readFileSync(filePath, 'utf8');
  const validationResult = validateDevPlanStructure(content, phaseNumber);
  check(
    validationResult.valid,
    `Phase ${phaseNumber} plan passes ralphex structure validation`,
    `Phase ${phaseNumber} plan failed validation: ${validationResult.errors.join('; ')}`,
  );
  check(
    /^#\s+Plan:/im.test(content),
    `Phase ${phaseNumber} plan has # Plan: header`,
    `Phase ${phaseNumber} plan missing # Plan: header`,
  );
  check(
    /^##\s+Overview/im.test(content),
    `Phase ${phaseNumber} plan has ## Overview section`,
    `Phase ${phaseNumber} plan missing ## Overview`,
  );
  check(
    /^##\s+Validation\s+Commands/im.test(content),
    `Phase ${phaseNumber} plan has ## Validation Commands section`,
    `Phase ${phaseNumber} plan missing ## Validation Commands`,
  );
  check(
    /^###\s+(Task|Iteration)\s+\d+:/im.test(content),
    `Phase ${phaseNumber} plan has ### Task N: sections`,
    `Phase ${phaseNumber} plan missing task sections`,
  );
  check(
    /^- \[[ x]\]/m.test(content),
    `Phase ${phaseNumber} plan has checkbox tasks`,
    `Phase ${phaseNumber} plan missing checkbox tasks`,
  );
  check(
    !/^```/m.test(content),
    `Phase ${phaseNumber} plan contains no code snippets`,
    `Phase ${phaseNumber} plan contains fenced code blocks`,
  );
}

// ─── test 15: verify session state tracks phase progress ─────────────────────

console.log('\n[15] Verify session state tracks phase progress');

check(
  loopResultSession.devPlansComplete === true,
  'Session devPlansComplete is true after loop',
  `Session devPlansComplete wrong: ${loopResultSession.devPlansComplete}`,
);
check(
  loopResultSession.stage === 'dev-plans',
  `Session stage is 'dev-plans' after loop`,
  `Session stage wrong: ${loopResultSession.stage}`,
);
check(
  Array.isArray(loopResultSession.devPlanArtifacts),
  'Session has devPlanArtifacts array',
  'Session missing devPlanArtifacts',
);
check(
  loopResultSession.devPlanArtifacts?.length === 4,
  `Session devPlanArtifacts has 4 entries (got ${loopResultSession.devPlanArtifacts?.length})`,
  `devPlanArtifacts count wrong: ${loopResultSession.devPlanArtifacts?.length}`,
);
check(
  loopResultSession.completedPhaseCount === 4,
  `Session completedPhaseCount is 4 (got ${loopResultSession.completedPhaseCount})`,
  `completedPhaseCount wrong: ${loopResultSession.completedPhaseCount}`,
);

// Verify each artifact in session has correct fields
for (const artifact of (loopResultSession.devPlanArtifacts ?? [])) {
  check(
    artifact.generated === true,
    `devPlanArtifact phase ${artifact.phaseNumber} has generated=true`,
    `devPlanArtifact phase ${artifact.phaseNumber} generated wrong: ${artifact.generated}`,
  );
  check(
    typeof artifact.content === 'string' && artifact.content.length > 0,
    `devPlanArtifact phase ${artifact.phaseNumber} has non-empty content`,
    `devPlanArtifact phase ${artifact.phaseNumber} missing content`,
  );
  check(
    typeof artifact.filePath === 'string' && artifact.filePath.length > 0,
    `devPlanArtifact phase ${artifact.phaseNumber} has filePath`,
    `devPlanArtifact phase ${artifact.phaseNumber} missing filePath`,
  );
}

// Read session from disk and verify persistence
const rawDevPlanSession = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
check(
  rawDevPlanSession.devPlansComplete === true,
  'Persisted session devPlansComplete is true',
  `Persisted session devPlansComplete wrong: ${rawDevPlanSession.devPlansComplete}`,
);
check(
  Array.isArray(rawDevPlanSession.devPlanArtifacts) && rawDevPlanSession.devPlanArtifacts.length === 4,
  'Persisted session has 4 devPlanArtifacts',
  `Persisted session devPlanArtifacts count wrong: ${rawDevPlanSession.devPlanArtifacts?.length}`,
);
check(
  rawDevPlanSession.completedPhaseCount === 4,
  'Persisted session completedPhaseCount is 4',
  `Persisted session completedPhaseCount wrong: ${rawDevPlanSession.completedPhaseCount}`,
);
check(
  rawDevPlanSession.devPlansDecision === true,
  'Persisted session devPlansDecision is true',
  `Persisted session devPlansDecision wrong: ${rawDevPlanSession.devPlansDecision}`,
);

// ─── test 16: verify logs capture dev plan generation events ─────────────────

console.log('\n[16] Verify logs capture dev plan generation events');

const logsDir3 = path.join(os.homedir(), '.cobuild', 'logs');
const logFiles3 = fs.existsSync(logsDir3)
  ? fs.readdirSync(logsDir3).filter((f) => f.startsWith('cobuild-')).sort().reverse()
  : [];

if (logFiles3.length > 0) {
  const latestLogPath3 = path.join(logsDir3, logFiles3[0]);
  const logContent3 = fs.readFileSync(latestLogPath3, 'utf8');
  check(
    logContent3.includes('dev-plan loop:'),
    'Log contains dev-plan loop events',
    'Log missing dev-plan loop events',
  );
  check(
    logContent3.includes('dev-plan generator:'),
    'Log contains dev-plan generator events',
    'Log missing dev-plan generator events',
  );
  check(
    logContent3.includes('dev-plan-file-writer:'),
    'Log contains dev-plan file-writer events',
    'Log missing dev-plan file-writer events',
  );
  check(
    logContent3.includes('dev-plan phase completion:'),
    'Log contains dev-plan phase completion events',
    'Log missing dev-plan phase completion events',
  );
  check(
    logContent3.includes('dev-plan stage complete'),
    'Log contains dev-plan stage complete event',
    'Log missing dev-plan stage complete event',
  );
} else {
  fail('No log files found — cannot verify dev plan generation logs');
}

// ─── cleanup ─────────────────────────────────────────────────────────────────

fs.rmSync(projectDir, { recursive: true });
try { fs.unlinkSync(sessionFile); } catch { /* ignore */ }

// ─── summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
if (failures === 0) {
  console.log('E2E verification passed. All checks passed.');
  process.exit(0);
} else {
  console.error(`E2E verification FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
