# Plan: cobuild Phase 1 – CLI Foundation and Runtime Shell

## Overview

This phase establishes the foundational infrastructure for the cobuild CLI tool.

The goal is to create a globally installable TypeScript CLI application with the core runtime environment, session persistence, logging, and a minimal interactive UI shell using Ink.

No AI interaction or artifact generation is implemented in this phase. The focus is purely on creating a stable runtime platform for later phases.

Key capabilities delivered in this phase:

- npm-installable CLI command (`cobuild`)
- interactive terminal detection
- fail-fast startup behavior
- global directory creation (`~/.cobuild`)
- session JSON persistence
- timestamped logging
- basic Ink UI layout
- Ollama runtime connectivity check

At the end of this phase, running `cobuild` should successfully start a basic interactive CLI session with persistent logging and session creation.

## Validation Commands

- npm run build
- npm run lint
- npm test
- node dist/cli/index.js --help

---

### Task 1: Initialize Project Repository and CLI Scaffold

- [x] Create new git repository for cobuild
- [x] Initialize Node.js project with `package.json`
- [x] Configure TypeScript (`tsconfig.json`)
- [x] Install core dependencies:
  - Ink
  - React
  - commander (or equivalent CLI arg parser)
  - uuid
- [x] Install development dependencies:
  - typescript
  - eslint
  - prettier
  - vitest or jest
- [x] Configure build script to compile TypeScript into `dist/`
- [x] Configure npm bin entry for global command `cobuild`
- [x] Implement basic CLI entrypoint `src/cli/index.ts`
- [x] Verify `npm link` installs `cobuild` command locally

---

### Task 2: Implement CLI Startup and Argument Parsing

- [x] Implement CLI argument parsing for `--new-session`
- [x] Create startup flow controller (`app-shell`)
- [x] Implement CLI help and usage text
- [x] Ensure CLI command launches successfully with no arguments
- [x] Implement basic runtime configuration object
- [x] Add structured startup logging

---

### Task 3: Implement Environment Validation

- [x] Implement interactive TTY detection
- [x] Exit immediately if terminal is non-interactive
- [x] Implement Ollama connectivity check
- [x] Fail immediately if Ollama is not reachable
- [x] Display clear user-friendly error messages
- [x] Log validation results

---

### Task 4: Implement Global Directory Bootstrap

- [x] Detect user home directory cross-platform
- [x] Create `.cobuild` directory if missing
- [x] Create `~/.cobuild/sessions/`
- [x] Create `~/.cobuild/logs/`
- [x] Implement reusable directory ensure utility
- [x] Ensure directories are created atomically and safely
- [x] Log directory initialization

---

### Task 5: Implement Logging Framework

- [x] Create structured logger module
- [x] Implement timestamped log entries
- [x] Write logs to `~/.cobuild/logs/`
- [x] Support log levels (info, warn, error, debug)
- [x] Implement append-friendly logging
- [x] Add runtime event logging (startup, validation results)
- [x] Implement error logging helper

---

### Task 6: Implement Session Schema and Persistence

- [x] Define initial session TypeScript schema
- [x] Implement session ID generation (UUID)
- [x] Implement session creation logic
- [x] Implement JSON session file persistence
- [x] Implement atomic write (temp file + rename)
- [x] Implement session load helper
- [x] Implement working directory capture
- [x] Implement session update timestamp logic
- [x] Log session creation and saves

---

### Task 7: Implement Basic Ink UI Shell

- [x] Install Ink and React CLI dependencies
- [x] Create root Ink app component
- [x] Implement terminal layout structure:
  - transcript area
  - input prompt area
  - status/progress bar
  - footer command area
- [x] Implement simple user input capture
- [x] Display placeholder system message
- [x] Render basic CLI UI successfully

---

### Task 8: Integrate Startup Flow with UI

- [ ] Wire startup flow to Ink UI renderer
- [ ] Create minimal screen controller
- [ ] Show startup status messages
- [ ] Display placeholder prompt:
  `What would you like to build today?`
- [ ] Confirm CLI remains interactive

---

### Task 9: Add Cross-Platform Path Utilities

- [ ] Implement path helpers for Windows/macOS/Linux
- [ ] Normalize filesystem paths
- [ ] Ensure safe filename helpers
- [ ] Implement home-directory resolution utility
- [ ] Add tests for path utilities

---

### Task 10: Add Basic Unit Tests

- [ ] Test session creation and persistence
- [ ] Test directory bootstrap
- [ ] Test logging module
- [ ] Test CLI argument parsing
- [ ] Test TTY detection logic
- [ ] Ensure tests run via CI command

---

### Task 11: Verify End-to-End CLI Execution

- [ ] Run CLI locally via `npm link`
- [ ] Verify session file creation
- [ ] Verify logs are written
- [ ] Verify UI renders correctly
- [ ] Verify Ollama validation behavior
- [ ] Verify failure on non-interactive terminal
- [ ] Verify command exits cleanly
