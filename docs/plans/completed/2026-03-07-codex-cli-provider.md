# Plan: Add Codex CLI Model Provider

## Validation Commands
- `npm run build`
- `npm run lint`
- `npm test`
- `npm run integration-test`

### Task 1: Introduce provider selection and provider-aware session state
- [x] Add a first-class provider identifier to the runtime/session model so sessions persist both the active provider and any provider-specific model value already in use.
- [x] Extend CLI config parsing to accept an explicit provider selection for new sessions while preserving the current default behavior for existing Ollama-based flows.
- [x] Update session creation, migration, and resume logic so older sessions without a provider field load safely as Ollama sessions.
- [x] Add unit tests for config parsing, session migration, and session resume behavior with both Ollama and Codex CLI providers.

### Task 2: Replace Ollama-only startup validation with provider-aware readiness checks
- [x] Refactor startup validation so it runs the correct readiness check for the selected or resumed provider instead of always calling `checkOllama`.
- [x] Keep the current Ollama reachability check for Ollama sessions and add a Codex CLI readiness check that verifies the `codex` executable is available and returns a clear actionable failure message when it is not.
- [x] Ensure resumed sessions validate against the provider saved in the session rather than any new-session default.
- [x] Add tests covering successful and failing startup for both providers, including resumed Codex CLI sessions.

### Task 3: Add a Codex CLI provider implementation behind a shared provider factory
- [x] Introduce a provider factory or equivalent abstraction that constructs the active provider instance from session/config state instead of instantiating `OllamaProvider` directly in the UI flow.
- [x] Implement a `CodexCliProvider` in `src/providers/` that satisfies the existing generation interface and shells out to the Codex CLI for interview and artifact generation requests.
- [x] Define a narrow provider capability surface so command/UI logic can distinguish between providers that support in-app model listing and providers that do not.
- [x] Add focused tests for the provider factory and the Codex CLI provider success, failure, timeout, and output parsing paths.

### Task 4: Preserve interview and artifact generation flows across providers
- [x] Update `ScreenController` and any related orchestration code to hold the active provider through the new factory/capability layer rather than through an `OllamaProvider`-typed ref.
- [x] Ensure interview turns, `/finish-now`, spec generation, architecture generation, high-level plan generation, and per-phase dev-plan generation all use the same active provider instance.
- [x] Preserve retry handling, error persistence, and logging semantics for Codex CLI-backed generation calls.
- [x] Add or update integration-style tests that cover the end-to-end orchestration path with a non-Ollama provider stub.

### Task 5: Disable `/model` for Codex CLI and make provider messaging explicit
- [x] Refactor `/model` handling to check provider capabilities before listing models.
- [x] Return a clear informational message for Codex CLI sessions stating that model changes must be made in Codex itself and cannot be changed from `cobuild`.
- [x] Keep the existing interactive model switching flow for Ollama unchanged.
- [x] Update `/provider` messaging so it reports the active provider and, for Codex CLI, mentions that model selection is managed externally.
- [x] Add unit and workflow tests covering `/model` and `/provider` behavior for both providers.

### Task 6: Update logs, errors, and user-facing text for multi-provider support
- [x] Replace Ollama-only wording in logs, transient errors, and UI copy where the text should now be provider-neutral.
- [x] Keep provider-specific error details where they help the user recover, including missing Codex CLI binary, failed Codex invocation, and Ollama connectivity failures.
- [x] Ensure provider name is included in relevant logs so mixed-provider issues can be diagnosed from session logs.
- [x] Add tests for the new provider-specific user messages and logging-sensitive branches where practical.

### Task 7: Document Codex CLI setup and revised command behavior
- [x] Update `README.md` requirements, installation, usage, startup flow, and slash-command sections to describe both Ollama and Codex CLI providers.
- [x] Document how a user selects Codex CLI, any prerequisites for authenticating/configuring Codex outside `cobuild`, and the fact that `/model` is unavailable for that provider.
- [x] Update any provider limitation or roadmap sections so they no longer claim Ollama is the only supported provider.
- [x] Review any generated help text or inline descriptions that still imply single-provider support.

### Task 8: Run full verification for both provider modes
- [x] Run the build, lint, unit test, and integration test commands after the implementation is complete.
- [x] Manually verify a fresh Ollama session still supports `/model` and `/provider` with no regression in generation flow.
- [x] Manually verify a fresh Codex CLI session can complete the same workflow and that `/model` returns the expected “change it in Codex” guidance.
- [x] Confirm resumed sessions preserve provider identity and do not cross wires between Ollama and Codex CLI runs.
