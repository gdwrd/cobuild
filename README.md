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
- At least one of the following AI providers (cobuild will start without one installed, but generation requires a working provider):

### Ollama (default)

- [Ollama](https://ollama.com) running locally at `http://localhost:11434`
- At least one Ollama model installed locally (any model will do)

Example model setup:

```sh
ollama pull llama3.2
```

When starting a new session, `cobuild` automatically selects the first model returned by Ollama's `/api/tags` endpoint. No hardcoded default model name is assumed. Use `/model` during the interview to list available models and switch to a different one at any time.

If you resume a session whose saved model is no longer installed, `cobuild` automatically falls back to the first available model, persists the update, and displays a notice in the UI explaining the switch.

If Ollama is running but has no models installed, `cobuild` starts normally and displays an actionable notice. Pull any model and then use `/model <name>` to continue.

### Codex CLI

- The `codex` binary installed and available on your `PATH`
- Any authentication or configuration required by Codex CLI must be completed before running `cobuild` — `cobuild` does not manage Codex credentials or settings

To use Codex CLI, pass `--provider codex-cli` when starting a new session:

```sh
cobuild --provider codex-cli
```

Model selection for Codex CLI is managed externally in Codex itself. The `/model` command is not available for Codex CLI sessions.

## Installation

Install from npm:

```sh
npm install -g @gdwrd/cobuild
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

On startup, `cobuild` runs a staged startup sequence displayed in the terminal:

1. Creates `~/.cobuild/`, `~/.cobuild/sessions/`, and `~/.cobuild/logs/` if needed.
2. Loads global settings from `~/.cobuild/settings.json` (if present).
3. Verifies that stdin is attached to a TTY.
4. Checks readiness for all known providers in parallel:
   - Ollama: verifies Ollama responds at `http://localhost:11434/api/tags`
   - Codex CLI: verifies the `codex` binary is available on your `PATH`
5. Resolves the active session for the current working directory. For new sessions, applies global settings defaults for provider and model before falling back to built-in defaults.

Each step appears as it completes in the startup screen. If a resumed session is found, an interstitial screen shows the session's stage, provider, model, and any resumable dev-plan progress before continuing.

`cobuild` does not exit if the active provider is unavailable. Instead it starts normally and displays a startup notice in the UI. You can switch to a working provider during the interview with `/provider <name>`.

When resuming a session, the provider saved in the session is used regardless of any `--provider` flag passed on the command line.

Session resolution behavior:

- If `--new-session` is set, a new session is always created.
- Otherwise, `cobuild` resumes the latest unfinished session for the current working directory.
- If the latest session is already complete, `cobuild` starts a new one.
- Dev-plan generation is also resumable. If a previous run stopped mid-phase, `cobuild` resumes from the first incomplete phase.

## UI Layout

Every screen in `cobuild` is wrapped in a persistent shell with:

- A status bar showing: `cobuild vX.Y.Z`, current stage, session ID (first 8 chars), active provider, and model. If the provider is unavailable, `[UNAVAILABLE]` appears in red. When resuming a session, a context note (e.g. `resumed from dev-plans`) is shown.
- A notice area (below screen content) for persistent warnings such as an unavailable provider.
- A transient error area that auto-dismisses after 5 seconds.
- A footer showing available commands and keybindings for the current screen.

Per-screen footers:

| Screen | Commands | Keys |
| --- | --- | --- |
| Interview | `/finish-now /model /provider /help` | `ctrl+c: quit` |
| Restored session | — | `enter: continue  ctrl+c: quit` |
| Yes/no decision | — | `y: yes  n: no  ctrl+c: quit` |
| Generation | — | `ctrl+c: quit` |
| Execution | — | `r: retry  l: inspect logs  y: continue  ctrl+c: quit` |

The generation screen uses a workflow stepper that shows each stage (`spec`, `architecture`, `plan`, `dev-plan`) with its status: completed (with file path), active, pending, or skipped. Phase counts, retry state, and stop reasons are shown inline. On success the stepper freezes in its final state and waits for any key press before exiting — it does not auto-exit after a timeout.

## Interview Experience

When you first launch `cobuild` and the interview has not yet started, a branded ASCII art logo is displayed above the input area:

```
  ___  ___  ___  _   _ ___ _    ___
 / __|/ _ \| _ )| | | |_ _|| |  |   \
| (__ | (_) | _ \| |_| || | | |__| |) |
 \___| \___/|___/ \___/|___||____|___/
    ⚙  build software with AI  ⚙
```

The logo is shown only when the transcript is empty. Once you type your first message, the logo is hidden to keep the screen clear for the conversation.

The interview is driven by a system prompt that instructs the model to:

- Ask exactly one question per response
- Gather enough detail for a technical specification
- Cover goals, users, features, preferences, constraints, integrations, and success criteria
- Finish when it has enough information, usually after roughly 8 to 15 questions

The transcript is persisted after every user and assistant message.

If you stop the process and run `cobuild` again in the same directory, the session resumes from the last saved point.

### Transcript Viewport

The transcript shows up to 10 messages at a time. When the conversation grows longer, use `PgUp` and `PgDn` to scroll back through earlier messages. The viewport auto-follows new messages when scrolled to the bottom. Scroll indicators appear above and below the visible window when messages are hidden.

### Input Editing

The input field supports cursor movement and basic editing:

- Left/Right arrow: move the cursor one character
- ctrl+a: jump to the start of the line
- ctrl+e: jump to the end of the line
- Backspace: delete the character before the cursor
- Delete: delete the character at the cursor (forward delete)

Editing state is managed with a reducer so rapid keypresses, repeated deletes, and mid-string edits all operate reliably on the latest buffer state.

When the buffer is empty, a hint reminds you to type a message or use `/help`.

### Slash Commands

These commands are available during the interview:

| Command | Description |
| --- | --- |
| `/finish-now` | End the interview immediately and ask the model to infer missing details so generation can begin |
| `/model` | List installed Ollama models and switch by number or name. Pass a model name directly to override without listing: `/model mistral`. If Ollama is unreachable, listing fails but manual override still works. Not available for Codex CLI sessions — model selection for Codex CLI is managed externally in Codex itself |
| `/provider` | Show the active provider and its availability status. Switch providers mid-session with `/provider <ollama\|codex-cli>` — the new provider is validated and persisted in the session |
| `/help` | Print the full command reference inline in the interview transcript |

Unknown slash commands display the `/help` message listing all available commands instead of being silently ignored.

### Slash Command Autocomplete

Typing `/` in the input field activates inline autocomplete. A suggestion list appears above the input showing all commands that match what you have typed so far.

- Up/Down arrows: move the selection through matching commands
- Enter: execute the highlighted command
- Continue typing: the list filters to match
- Backspace past the `/`: the suggestion list closes
- Ctrl+c: quit (autocomplete does not intercept it)

Each suggestion shows the command name and a short usage hint. When autocomplete is open, Enter runs the selected command directly without requiring you to finish typing it.

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

The yes/no prompts are interactive and support `y` (Yes), `n` (No), up/left arrows (move to Yes), down/right arrows (move to No), and Enter to confirm the highlighted option.

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

## Global Settings

`cobuild` stores persistent user preferences in a global settings file:

```txt
~/.cobuild/settings.json
```

The settings file is created automatically once you write any default via a future `/settings` workflow. Until then, the file is absent and all values fall back to their defaults. You can create or edit it manually — `cobuild` validates the file on load and silently falls back to defaults on any parse error or unknown schema version.

### Settings Schema

```json
{
  "schemaVersion": 1,
  "defaultProvider": "ollama",
  "defaultOllamaModel": "llama3.2"
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | — | Internal version for migration. Currently `1`. |
| `defaultProvider` | `"ollama"` or `"codex-cli"` | `"ollama"` | Provider used when starting a new session with no `--provider` flag. |
| `defaultOllamaModel` | string | none | Ollama model name preferred when starting a new Ollama session. Falls back to the first installed model if this model is not available. |

### Precedence Order

When resolving the provider and model for a new session:

1. `--provider` CLI flag (explicit, always wins for new sessions)
2. Global settings defaults (`defaultProvider`, `defaultOllamaModel`)
3. Built-in defaults (`ollama` provider, first installed model)

Resumed sessions always use the provider and model saved in the session file, regardless of CLI flags or global settings. To switch providers on a resumed session, use `/provider <name>` during the interview.

### Provider-Specific Model Display

The status bar header only shows a model name when the active provider supports in-app model selection:

- **Ollama sessions**: the active model is shown in the header and updated whenever you use `/model`.
- **Codex CLI sessions**: no model appears in the header. Model selection for Codex CLI is managed externally in Codex itself.

This rule applies consistently across new sessions, resumed sessions, and mid-interview provider switches.

## Local Storage Layout

| Path | Purpose |
| --- | --- |
| `~/.cobuild/` | Application home directory |
| `~/.cobuild/settings.json` | Global user settings (default provider, default model) |
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
- Supports in-app model listing and switching via `/model`
- Supports manual model name override via `/model <name>` even when Ollama is temporarily unreachable

### Codex CLI

- Invokes the `codex` binary on your `PATH` with `--quiet` and the conversation prompt
- Authentication, model selection, and Codex configuration are managed externally in Codex itself
- The `/model` command is disabled for Codex CLI sessions
- A 120-second per-call timeout applies

You can switch between providers at any time during the interview using `/provider <ollama|codex-cli>`. The switch is validated against the target provider and persisted in the session.

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

## Troubleshooting

### Ollama is not running or not reachable

`cobuild` checks Ollama at `http://localhost:11434/api/tags` on startup. If it is unavailable, a notice appears in the UI but the session still starts. Common causes:

- Ollama is not installed. See [ollama.com](https://ollama.com) for installation instructions.
- Ollama is installed but not running. Start it with `ollama serve` (or the Ollama app on macOS).
- Ollama is running on a non-default port. cobuild does not currently support a configurable Ollama URL.
- No models are installed. Pull at least one model: `ollama pull llama3.2` (or any model you prefer).

If Ollama becomes available while the interview is in progress, use `/provider ollama` to switch to it.

### Codex CLI is not found or not working

`cobuild` looks for the `codex` binary on your `PATH` by running `codex --version`. If it is missing or fails:

- Verify the binary is installed and on your `PATH`: `which codex` or `codex --version`.
- Check that any required Codex authentication and configuration is complete before running `cobuild`. cobuild does not manage Codex credentials.

If Codex CLI is your preferred provider and it is already installed, switch to it during the interview: `/provider codex-cli`.

### No providers are available

If both Ollama and Codex CLI are unavailable at startup, `cobuild` will show a warning but still launch. You can use the interview to explore the project description, but generation will fail when the interview completes. Set up at least one provider before letting `cobuild` generate artifacts.

### Model listing fails during `/model`

If `/model` reports that it cannot reach Ollama to list models, you can still set a model manually:

```sh
/model mistral
/model llama3:latest
```

This bypasses the listing step and sets the model name directly in the session.

### The prompt is too large

If `cobuild` warns that the prompt is too large, the interview transcript has grown past the internal limit of roughly 8000 estimated tokens. Use `/finish-now` to end the interview immediately. `cobuild` will ask the model to infer any missing details and proceed to generation.

### Multiple cobuild processes in the same directory

Running more than one `cobuild` process in the same project directory at the same time can cause session conflicts. Only one `cobuild` process should be active per directory at a time.

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
| `src/ui/` | Ink UI: `AppShell` (shared chrome), `ScreenController` (screen router), `StartupScreen`, `ErrorScreen`, `RestoredSession`, `App` (interview with bounded transcript viewport and cursor-aware input), `InterviewLogo` (branded ASCII art logo shown on the welcome/empty-transcript state), `ModelSelectPrompt` (keyboard-driven model picker), `YesNoPrompt`, `GenerationScreen` (workflow stepper with stable completion state), `ExecutionConsole` (execution output pane with scrollback, validation summaries, and action prompts; wired but awaiting a ralphex runner), `FlowWrapper` (lifecycle chrome shared by generation and execution flows), and `types.ts` (shared UI state contracts including `ExecutionState` and `applyExecutionEvent` reducer) |
| `src/settings/` | Global settings module: `settings.ts` (schema, atomic load/save, migration) |
| `src/interview/` | Interview loop, prompts, slash commands, and retry logic |
| `src/providers/` | Model provider implementations |
| `src/artifacts/` | Artifact prompts, generators, validators, file output, and dev-plan workflow |
| `src/session/` | Session schema, persistence, resume logic, and workflow state |
| `src/logging/` | File-based logger |
| `src/fs/` | Application directory bootstrap |
| `src/validation/` | Environment validation |
| `scripts/` | End-to-end verification utilities |

## Release

The current package version is `0.1.2`. Release notes are in `RELEASE_NOTES.md`.
