# cobuild v0.1.1 — Release Notes

## Overview

cobuild v0.1.1 is the release candidate for the first public npm release. It provides an interactive, AI-powered CLI workflow that takes a software project idea through a structured interview and generates a full set of planning artifacts using a locally running AI model. Two providers are supported: Ollama (default) and Codex CLI.

## What's included

- Interactive interview engine with slash command support (`/finish-now`, `/model`, `/provider`)
- Multi-provider support: Ollama (local inference via `/api/chat`) and Codex CLI (via the `codex` binary)
- Runtime provider switching via `/provider <ollama|codex-cli>` during the interview
- Startup that does not block on provider availability: cobuild launches with a notice if the active provider is unreachable, so you can switch providers without restarting
- AI-generated project specification (`docs/<project>-spec.md`)
- AI-generated architecture document (`docs/<project>-architecture.md`)
- AI-generated high-level development plan (`docs/<project>-high-level-plan.md`)
- AI-generated per-phase developer plans (`docs/plans/YYYY-MM-DD-phase-<N>-<title>.md`)
- Session persistence with automatic resume: re-running cobuild in the same directory picks up where you left off
- Dev-plan resume: if a run stops mid-phase, the next run continues from the first incomplete phase
- Retry logic with configurable attempt limits for all generation stages
- Structured validation of all generated artifacts before they are accepted
- Atomic file writes to prevent partial or corrupted output
- Daily log files at `~/.cobuild/logs/` with full debug output and session IDs
- Session files at `~/.cobuild/sessions/` with schema versioning and forward-compatible migration

## Requirements

- Node.js >= 18.0.0
- At least one of the following AI providers:
  - [Ollama](https://ollama.com) running locally at `http://localhost:11434` with at least one model pulled (e.g. `ollama pull llama3`)
  - [Codex CLI](https://github.com/openai/codex) installed and available on your `PATH`, with authentication configured

## Installation

```sh
npm install -g @gdwrd/cobuild
```

## Known limitations

See the [Known Limitations](README.md#known-limitations) section of the README for a full list.

## Upgrade notes

This is the initial release; there is no prior version to upgrade from.
