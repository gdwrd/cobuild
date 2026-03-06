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

## Startup Behavior

cobuild validates the environment before starting:

- Requires an interactive terminal (TTY). Piped or scripted invocations will fail immediately.
- Requires Ollama to be reachable at `http://localhost:11434`. If Ollama is not running, cobuild exits with a clear error message.

## Local Data

cobuild writes to `~/.cobuild/`:

| Path | Contents |
|------|----------|
| `~/.cobuild/sessions/` | JSON session files (UUID-named, one per session) |
| `~/.cobuild/logs/` | Daily log files (`cobuild-YYYY-MM-DD.log`) |

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
