# cobuild

Interactive AI-powered CLI build assistant.

## Requirements

- Node.js >= 18.0.0
- [Ollama](https://ollama.com) running locally at `http://localhost:11434`

## Installation

```sh
npm install -g cobuild
```

For development:

```sh
npm install
npm run build
npm link
```

## Usage

```sh
cobuild                 # Start cobuild, resuming the last session
cobuild --new-session   # Start cobuild with a fresh session
cobuild --help          # Show help
cobuild -v              # Print version
```

## CLI Flags

| Flag            | Description                                        |
|-----------------|----------------------------------------------------|
| `--new-session` | Discard any existing session and start a fresh one |
| `--verbose`     | Enable verbose logging                             |
| `-v, --version` | Print the current version                          |

## What cobuild generates

After the interview completes, cobuild runs a multi-stage generation pipeline:

1. **Project specification** — always generated; saved to `docs/<project>-spec.md`
2. **Architecture document** — generated if you answer yes when prompted; saved to `docs/<project>-architecture.md`
3. **High-level development plan** — generated if you answer yes when prompted (requires architecture); saved to `docs/<project>-high-level-plan.md`

All files are written to a `docs/` directory under your current working directory.

> **Note:** cobuild requires an interactive terminal throughout the full session, including during the generation prompts. Non-interactive (piped or scripted) invocations will fail immediately.

## Startup Behavior

cobuild validates the environment before starting:

- Requires an interactive terminal (TTY). Piped or scripted invocations will fail immediately.
- Requires Ollama to be reachable at `http://localhost:11434`. If Ollama is not running, cobuild exits with a clear error message.

## Local Data

cobuild writes to `~/.cobuild/` and to your project directory:

| Path | Contents |
|------|----------|
| `~/.cobuild/sessions/` | JSON session files (UUID-named, one per session) |
| `~/.cobuild/logs/` | Daily log files (`cobuild-YYYY-MM-DD.log`) |
| `<project>/docs/` | Generated artifacts: spec, architecture, and plan Markdown files |

## Development

```sh
npm run build        # Compile TypeScript to dist/
npm run build:watch  # Watch mode
npm test             # Run tests
npm run test:ci      # Run tests with verbose output
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # Type-check without emitting
```
