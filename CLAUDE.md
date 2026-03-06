# CLAUDE.md — cobuild AI Knowledge Base

## Build and Test Commands

- `npm run build` — compile TypeScript (outputs to `dist/`)
- `npm test` — run all tests with vitest
- `npm run test:ci` — verbose test output for CI
- `npm run lint` — ESLint over `src/`
- `npm run typecheck` — type-check without emitting

## Project Structure

```
src/
  cli/         — entrypoint (index.ts), runtime config (config.ts), startup orchestrator (app-shell.ts)
  fs/          — directory bootstrap (bootstrap.ts)
  logging/     — Logger class and getLogger() singleton (logger.ts)
  session/     — Session schema, creation, atomic persistence (session.ts)
  ui/          — Ink components: App.tsx (main shell), ScreenController.tsx (screen router)
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
- **Screen controller pattern**: `ScreenController.tsx` manages a `Screen` type (`'startup' | 'main' | 'error'`) and renders different Ink components per state.

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
