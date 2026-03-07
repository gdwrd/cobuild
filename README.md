# cobuild

Interactive AI-powered CLI build assistant for turning a project idea into planning documents from your terminal.

`cobuild` runs a structured interview against a local AI model, saves the transcript as a resumable session, and then generates a specification plus optional follow-on artifacts for architecture and implementation planning. It supports multiple AI providers: Ollama (default) and Codex CLI.

## What It Does

Given a project directory, `cobuild` can generate:

1. A project specification
2. An architecture document
3. A high-level development plan
4. Per-phase development plans

The workflow is interactive and stateful:

1. Start `cobuild` inside the project directory you want to plan.
2. Answer a guided interview in the terminal.
3. Let `cobuild` generate the spec.
4. Choose whether to continue into architecture, high-level planning, and per-phase plans.
5. Re-run `cobuild` later to resume the latest unfinished session for that same directory.

## Requirements

- Node.js `>= 18.0.0`
- A real interactive terminal (`TTY`) for the full session
- One of the following AI providers:

### Ollama (default)

- [Ollama](https://ollama.com) running locally at `http://localhost:11434`
- At least one Ollama model installed locally

Example model setup:

```sh
ollama pull llama3
```

`cobuild` defaults to the `llama3` model unless the session already has a different model saved or you switch models during the interview with `/model`.

### Codex CLI

- The `codex` binary installed and available on your `PATH`
- Any authentication or configuration required by Codex CLI must be completed before running `cobuild` — `cobuild` does not manage Codex credentials or settings

To use Codex CLI, pass `--provider codex-cli` when starting a new session:

```sh
cobuild --provider codex-cli
```

Model selection for Codex CLI is managed externally in Codex itself. The `/model` command is not available for Codex CLI sessions.

## Installation

Install from the package:

```sh
npm install -g cobuild
```

Install for local development:

```sh
npm install
npm run build
npm link
```

## Usage

Run inside the project directory you want to document:

```sh
cobuild
```

Common commands:

```sh
cobuild                         # Start or resume the latest unfinished session in this directory
cobuild --new-session           # Ignore the latest unfinished session and create a new one
cobuild --provider codex-cli    # Start a new session using Codex CLI as the AI provider
cobuild --verbose               # Enable verbose startup logging marker
cobuild --help                  # Show CLI help
cobuild -v                      # Print version
```

## CLI Flags

| Flag | Description |
| --- | --- |
| `--new-session` | Start a fresh session instead of resuming the latest unfinished session for the current working directory |
| `--provider <provider>` | AI provider to use for a new session: `ollama` (default) or `codex-cli`. Ignored when resuming an existing session (the saved provider is used instead) |
| `--verbose` | Enable verbose startup logging marker |
| `-v, --version` | Print the current version |

## Runtime Flow

On startup, `cobuild`:

1. Creates `~/.cobuild/`, `~/.cobuild/sessions/`, and `~/.cobuild/logs/` if needed.
2. Verifies that stdin is attached to a TTY.
3. Runs a provider readiness check for the selected or resumed provider:
   - Ollama: verifies Ollama responds at `http://localhost:11434/api/tags`
   - Codex CLI: verifies the `codex` binary is available on your `PATH`
4. Resolves the active session for the current working directory.

When resuming a session, the provider saved in the session is used regardless of any `--provider` flag passed on the command line.

Session resolution behavior:

- If `--new-session` is set, a new session is always created.
- Otherwise, `cobuild` resumes the latest unfinished session for the current working directory.
- If the latest session is already complete, `cobuild` starts a new one.
- Dev-plan generation is also resumable. If a previous run stopped mid-phase, `cobuild` resumes from the first incomplete phase.

## Interview Experience

The interview is driven by a system prompt that instructs the model to:

- Ask exactly one question per response
- Gather enough detail for a technical specification
- Cover goals, users, features, preferences, constraints, integrations, and success criteria
- Finish when it has enough information, usually after roughly 8 to 15 questions

The transcript is persisted after every user and assistant message.

If you stop the process and run `cobuild` again in the same directory, the session resumes from the last saved point.

### Slash Commands

These commands are available during the interview:

| Command | Description |
| --- | --- |
| `/finish-now` | End the interview immediately and ask the model to infer missing details so generation can begin |
| `/model` | List installed Ollama models and switch the session to a different model by number or exact name. Not available for Codex CLI sessions — model selection for Codex CLI is managed externally in Codex itself |
| `/provider` | Show the active provider. For Codex CLI sessions, also notes that model selection is managed externally |

Unknown slash commands are ignored.

### Prompt Size Guardrail

`cobuild` estimates prompt size with a simple `chars / 4` heuristic and stops sending interview turns once the transcript grows past the configured limit of about `8000` estimated tokens.

When that happens, the UI tells you to use `/finish-now` so it can generate the spec from the transcript collected so far.

## Generation Workflow

After the interview completes, `cobuild` always generates the spec first. The rest of the workflow is decision-driven:

1. Generate project specification
2. Ask whether to generate an architecture document
3. If yes, generate architecture document
4. Ask whether to generate a high-level development plan
5. If yes, generate the high-level plan and extract its phases
6. Ask whether to generate per-phase dev plans
7. If yes, generate each phase plan sequentially

The yes/no prompts are interactive and support `y`, `n`, arrow keys, and Enter.

If you decline any optional stage, the workflow stops cleanly and keeps the artifacts already generated.

## Generated Files

All generated artifacts are written under the current working directory.

### Spec

- Path: `docs/<project>-spec.md`
- Filename source: basename of the current working directory
- Validation requirements:
  - Project overview
  - Functional requirements
  - Acceptance criteria

### Architecture

- Path: `docs/<project>-architecture.md`
- Generated only if you opt in after spec creation
- Validation requirements:
  - System components
  - Data flow
  - External integrations
  - Storage choices
  - Deployment/runtime model
  - Security considerations
  - Failure handling

### High-Level Plan

- Path: `docs/<project>-high-level-plan.md`
- Generated only if you opt in after architecture
- Validation requirements:
  - Between 4 and 8 phases
  - Sequentially numbered phases starting at 1
  - Each phase must include:
    - Goal
    - Scope
    - Deliverables
    - Dependencies
    - Acceptance criteria

### Per-Phase Dev Plans

- Path: `docs/plans/YYYY-MM-DD-phase-<N>-<title>.md`
- Generated only if you opt in after the high-level plan
- Generated sequentially, one file per extracted phase
- Validation requirements:
  - `# Plan:` title
  - `## Overview`
  - `## Validation Commands`
  - At least one `### Task N:` or `### Iteration N:` section
  - Markdown checkbox tasks
  - No fenced code blocks
  - The current phase number must appear in the title or opening

### File Writing Behavior

- `docs/` and `docs/plans/` are created automatically when needed.
- Artifact writes are atomic via temp-file plus rename.
- Existing files are never overwritten directly.
- If a target filename already exists, `cobuild` appends `-2`, `-3`, and so on until it finds a free path.

## Session Persistence

Sessions are stored as JSON files in:

```txt
~/.cobuild/sessions/
```

Each session records:

- Session ID
- Working directory
- Interview transcript
- Current stage
- Active provider (`ollama` or `codex-cli`)
- Selected model (Ollama sessions)
- Generation attempt counters
- Generated artifact metadata
- Extracted plan phases
- Dev-plan completion progress
- Last error and retry-exhaustion state

Sessions use a schema version field and are migrated on load with best-effort field mapping.

## Logging

Daily log files are written to:

```txt
~/.cobuild/logs/cobuild-YYYY-MM-DD.log
```

The logger writes debug, info, warning, and error entries, including session IDs and generation-stage details where available.

## Retry and Failure Handling

Model-backed generation stages use retry logic:

- Default max attempts: `5`
- Delay between attempts: `2000ms`

This applies to:

- Spec generation
- Architecture generation
- High-level plan generation
- Per-phase dev-plan generation

Behavior on failure:

- Non-recoverable generation failures are persisted into the session as `lastError`.
- If retries are exhausted during spec, architecture, or high-level plan generation, the UI offers:
  - `R` to retry the pipeline
  - Any other key to exit
- If retries are exhausted during per-phase dev-plan generation, the session is marked halted and can be resumed later by running `cobuild` again in the same directory.

## Local Storage Layout

| Path | Purpose |
| --- | --- |
| `~/.cobuild/` | Application home directory |
| `~/.cobuild/sessions/` | Session JSON files |
| `~/.cobuild/logs/` | Daily log files |
| `<project>/docs/` | Generated spec, architecture, and high-level plan |
| `<project>/docs/plans/` | Generated per-phase dev plans |

## Provider Support

`cobuild` supports two providers:

### Ollama (default)

- Runs locally at `http://localhost:11434`
- `cobuild` checks `/api/tags` on startup and uses `/api/chat` for generation
- Responses are non-streaming
- Supports in-app model switching via `/model`

### Codex CLI

- Invokes the `codex` binary on your `PATH` with `--quiet` and the conversation prompt
- Authentication, model selection, and Codex configuration are managed externally in Codex itself
- The `/model` command is disabled for Codex CLI sessions
- A 120-second per-call timeout applies

There is no support yet for:

- Remote hosted providers accessed directly via API key
- Multi-provider routing within a single session

## Limitations

- Interactive terminal required. Piped or scripted use is rejected.
- Ollama sessions require Ollama to be running locally at `http://localhost:11434`.
- Codex CLI sessions require the `codex` binary to be installed and on your `PATH`. Authentication and model configuration must be set up in Codex before running `cobuild`.
- The `/model` command is only available for Ollama sessions. Codex CLI sessions do not support in-app model switching.
- Prompt size estimation is heuristic, not tokenizer-accurate.
- Generation output is not streamed token-by-token.
- Running multiple `cobuild` processes in the same project directory can create session conflicts.
- The `--verbose` flag currently records a startup log entry but does not change logger filtering.
- Windows support is not documented or tested in the codebase.

## Development

Available scripts:

```sh
npm run build             # Compile TypeScript to dist/
npm run build:watch       # Rebuild on change
npm run lint              # Run ESLint on src/
npm run format            # Run Prettier on src/
npm run test              # Run Vitest
npm run test:ci           # Run Vitest with verbose reporter
npm run test:watch        # Run Vitest in watch mode
npm run typecheck         # Type-check without emitting
npm run integration-test  # Build, then run the end-to-end verification script
```

## Project Structure

| Path | Purpose |
| --- | --- |
| `src/cli/` | CLI entrypoint, config, and startup orchestration |
| `src/ui/` | Ink UI screens for interview, restore, yes/no prompts, and generation |
| `src/interview/` | Interview loop, prompts, slash commands, and retry logic |
| `src/providers/` | Model provider implementations |
| `src/artifacts/` | Artifact prompts, generators, validators, file output, and dev-plan workflow |
| `src/session/` | Session schema, persistence, resume logic, and workflow state |
| `src/logging/` | File-based logger |
| `src/fs/` | Application directory bootstrap |
| `src/validation/` | Environment validation |
| `scripts/` | End-to-end verification utilities |

## Release

The current package version is `0.1.0`. Release notes are in `RELEASE_NOTES.md`.
