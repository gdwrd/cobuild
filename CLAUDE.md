# CLAUDE.md — cobuild AI Knowledge Base

## Build and Test Commands

- `npm run build` — compile TypeScript (outputs to `dist/`)
- `npm test` — run all tests with vitest
- `npm run test:ci` — verbose test output for CI
- `npm run lint` — ESLint over `src/`
- `npm run typecheck` — type-check without emitting
- `node scripts/verify-e2e.mjs` — end-to-end verification: runs cobuild from a temp directory, completes an interview, and asserts the spec file was created in `docs/` with correct session state

## Project Structure

```
src/
  cli/         — entrypoint (index.ts), runtime config (config.ts), startup orchestrator (app-shell.ts)
  fs/          — directory bootstrap (bootstrap.ts)
  interview/   — interview engine: controller.ts (loop, ModelProvider interface, COMPLETION_MARKER),
                 commands.ts (slash command router), prompts.ts (system prompt, token estimation),
                 finish-now.ts (/finish-now handler), model-command.ts (/model handler, ModelLister),
                 provider-command.ts (/provider handler), retry.ts (withRetry, RetryExhaustedError)
  logging/     — Logger class and getLogger() singleton (logger.ts)
  providers/   — ollama.ts (OllamaProvider: generate via /api/chat, listModels via /api/tags, 120s timeout)
  artifacts/   — artifact generation framework: generator.ts (ArtifactGenerator interface, runArtifactPipeline,
                 transitionToArtifactStage), spec-generator.ts (SpecGenerator, incrementGenerationAttempts,
                 normalizeSpecOutput), spec-prompt.ts (SPEC_SYSTEM_PROMPT, buildSpecMessages,
                 logSpecPromptMetadata), spec-validator.ts (validateSpecStructure, assertValidSpec,
                 SpecValidationError), file-output.ts (ensureDocsDir, generateFilename,
                 generateArchitectureFilename, generatePlanFilename, sanitizeFilename, resolveOutputPath,
                 writeArtifactFile), arch-generator.ts (ArchGenerator, incrementArchGenerationAttempts,
                 normalizeArchOutput), arch-prompt.ts (ARCH_SYSTEM_PROMPT, buildArchMessages,
                 logArchPromptMetadata), arch-validator.ts (validateArchStructure, assertValidArch,
                 ArchValidationError), plan-generator.ts (PlanGenerator, incrementPlanGenerationAttempts,
                 normalizePlanOutput), plan-prompt.ts (PLAN_SYSTEM_PROMPT, buildPlanMessages,
                 logPlanPromptMetadata), plan-validator.ts (validatePlanStructure, assertValidPlan,
                 PlanValidationError), plan-parser.ts (extractPhases),
                 workflow-controller.ts (runPostSpecWorkflow, PostSpecWorkflowOptions, PostSpecStage)
  session/     — Session schema, creation, atomic persistence, transcript append, session resolution (session.ts)
  ui/          — Ink components: App.tsx (main shell), ScreenController.tsx (screen router),
                 RestoredSession.tsx (resumed-session interstitial screen),
                 GenerationScreen.tsx (multi-stage generation progress/status screen),
                 YesNoPrompt.tsx (yes/no decision prompt for post-spec workflow)
  utils/       — Cross-platform path helpers (paths.ts)
  validation/  — TTY detection and Ollama connectivity check (env.ts)
```

## Key Architectural Patterns

- **ESM-only**: `"type": "module"` in package.json. All imports must use `.js` extensions even for `.ts` source files (NodeNext module resolution).
- **Module: NodeNext**: `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`. Required for ESM compatibility with Node.js.
- **Startup flow**: `src/cli/index.ts` creates a `startupPromise` from `runStartup()` and passes it to the Ink `ScreenController`. The UI renders a startup screen while startup runs concurrently.
- **Fail-fast validation**: `runStartup` in `app-shell.ts` checks TTY interactivity, Ollama reachability, and directory bootstrap before proceeding. Any failure causes the UI to display an error and exit with code 1.
- **Atomic session writes**: Sessions are written via `.tmp` file then renamed (`writeFileSync` + `renameSync`) to prevent partial writes.
- **Logger singleton**: `getLogger()` returns a module-level singleton `Logger`. Tests mock `../../logging/logger.js` to avoid file I/O.
- **Silent log failures**: The logger catches file write errors silently to prevent log I/O from crashing the CLI.
- **Screen controller pattern**: `ScreenController.tsx` manages a `Screen` type (`'startup' | 'restored' | 'main' | 'generating' | 'yesno' | 'error'`) and renders different Ink components per state. The `'restored'` screen shows `RestoredSession` when startup resolves with `sessionResolution: 'resumed'`. The `'generating'` screen shows `GenerationScreen` and is entered automatically after the interview completes. The `'yesno'` screen renders `YesNoPrompt` and blocks the artifact pipeline until the user answers; the resolver is stored in `yesNoResolverRef` and invoked by `handleYesNoAnswer`.
- **Artifact pipeline trigger**: When `interviewComplete` becomes `true` in `ScreenController`, a `useEffect` fires that transitions to `'generating'` screen and calls `runArtifactPipeline`. The pipeline uses `SpecGenerator` (which internally applies `withRetry` up to `DEFAULT_MAX_ATTEMPTS` times). On success the file is written atomically via `writeArtifactFile`, then `persistSpecArtifact` and `completeSpecStage` are called in sequence. On file-write failure `persistErrorState` is called and the error is shown in `GenerationScreen`.
- **Post-spec workflow**: After `SpecGenerator` succeeds, `runPostSpecWorkflow` (in `src/artifacts/workflow-controller.ts`) is called with an `onDecision` callback. Each decision transitions the screen to `'yesno'`, where `YesNoPrompt` resolves the pending `Promise<boolean>` via `yesNoResolverRef`. The workflow then either terminates (user declined) or proceeds to generate the next artifact (`ArchGenerator` → `PlanGenerator`). If the user declines at any point, `terminatedAt` is set and the app shows a success state before exiting.
- **Session resolution**: `runStartup` in `app-shell.ts` calls `findLatestByWorkingDirectory` to find an incomplete session for the current working directory. If found, it sets `sessionResolution: 'resumed'`; otherwise creates a new session. The `--new-session` flag bypasses lookup. `StartupResult` includes `sessionStage` for the resumed session's current stage.

## Toolchain

- **TypeScript 5.5**, strict mode, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- **Vitest 2** for tests (not Jest). Config in `vitest.config.ts`.
- **ESLint 8** with `@typescript-eslint`. Config in `.eslintrc.json`.
- **Prettier 3**. Config in `.prettierrc.json` (single quotes, 2-space indent, 100-char width).
- **Ink 5** + **React 18** for terminal UI.
- **commander 12** for CLI argument parsing.
- **uuid 10** for session ID generation.

## Conventions

- Test files live at `src/<module>/__tests__/<file>.test.ts`.
- All source modules use named exports (no default exports).
- Log level default is `'debug'` (all messages written). Minimum level can be set via `new Logger(path, minLevel)`.
- Log files are daily: `~/.cobuild/logs/cobuild-YYYY-MM-DD.log`.
- Session files are UUID-named JSON: `~/.cobuild/sessions/<uuid>.json`.

## Testing Conventions

- Mock `../../logging/logger.js` in tests to avoid filesystem I/O.
- Mock `../../fs/bootstrap.js` in `app-shell` tests to avoid real directory creation.
- Use `vi.resetAllMocks()` (not `clearAllMocks`) in `beforeEach` to reset both call counts and implementations.
- For Ink UI component tests, use `render()` from `ink` with a `PassThrough` stream as stdout. Call `unmount()` after assertions.

## Non-Obvious Behaviors

- `getLogger()` instantiates the singleton on first call with a date-stamped log path. Tests must mock the logger module before any import that triggers `getLogger()`.
- The `--verbose` flag is parsed and stored in `RuntimeConfig` but currently only adds a single log line; it does not change the log level.
- `safeFilename()` in `src/utils/paths.ts` strips leading/trailing dots in addition to unsafe characters, and truncates at 255 chars.
- The `.gitignore` includes `.ralphex/` — this is an AI agent artifact directory and should not be committed.
- **Interview completion marker**: The model signals end-of-interview by including the literal string `[INTERVIEW_COMPLETE]` anywhere in its response. `controller.ts` detects this, strips all occurrences from the displayed text, and calls `completeInterview()`. The marker is defined as `COMPLETION_MARKER` in `controller.ts` and referenced in the system prompt in `prompts.ts`.
- **Token estimation**: `prompts.ts` estimates token count as `ceil(charCount / 4)` with 4 tokens overhead per message. Logs a warning when estimated total exceeds `MAX_PROMPT_TOKENS = 8000`. This is a rough heuristic, not a tokenizer.
- **Session stage lifecycle**: New sessions start with `stage: 'interview'`. `completeInterview()` transitions to `stage: 'spec'` and sets `completed: true`. After spec artifact is written, `completeSpecStage()` advances to `stage: 'architecture'`. After architecture artifact is written, `completeArchitectureStage()` advances to `stage: 'plan'`. After plan artifact is written, `completePlanStage()` keeps `stage: 'plan'` (terminal stage). The full stage sequence is `interview` → `spec` → `architecture` → `plan`. Sessions are only resumed (not started fresh) when `completed: false`.
- **Session schema extensions**: `Session` gained fields across phases — phase 3: `generationAttempts?: number`, `specArtifact?: { content, filePath, generated }`, `lastError?: string`. Phase 4 added: `architectureDecision?: boolean`, `planDecision?: boolean` (user responses to post-spec prompts), `architectureArtifact?: { content, filePath, generated }`, `planArtifact?: { content, filePath, generated }`, `architectureGenerationAttempts?: number`, `planGenerationAttempts?: number`, `extractedPhases?: PlanPhase[]` (structured phase objects; `PlanPhase` has: `number`, `title`, `goal`, `scope`, `deliverables`, `dependencies`, `acceptanceCriteria`).
- **Spec validation**: `assertValidSpec()` in `src/artifacts/spec-validator.ts` throws `SpecValidationError` if the generated Markdown is missing any of three required headings: project overview (also matches `overview`, `description`, `project description`), functional requirements (also matches `requirements`), or acceptance criteria. Matching is case-insensitive and heading-level-agnostic (h1–h3). Because `SpecGenerator.generate()` calls `assertValidSpec` after receiving the model response, a structurally invalid generation propagates through `withRetry` and exhausts retries if the model consistently omits required sections.
- **Architecture and plan validation**: `assertValidArch()` in `src/artifacts/arch-validator.ts` throws `ArchValidationError` if the architecture document is missing any of seven required headings: system components, data flow, external integrations, storage choices, deployment/runtime model, security considerations, failure handling. `assertValidPlan()` in `src/artifacts/plan-validator.ts` throws `PlanValidationError` if the plan contains fewer than 4 or more than 8 phases, phases are not numbered sequentially from 1, or any phase is missing required fields: goal, scope, deliverables, dependencies, acceptance criteria. Both validators are called inside `withRetry` in their respective generators, matching the `SpecGenerator` pattern.
