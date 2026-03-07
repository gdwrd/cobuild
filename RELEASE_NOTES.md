# cobuild v0.1.0 — Release Notes

## Overview

cobuild v0.1.0 is the first public release. It provides an interactive, AI-powered CLI workflow that takes a software project idea through a structured interview and generates a full set of planning artifacts using a locally running Ollama model.

## What's included

- Interactive interview engine with slash command support (`/finish-now`, `/model`, `/provider`)
- AI-generated project specification (`docs/<project>-spec.md`)
- AI-generated architecture document (`docs/<project>-architecture.md`)
- AI-generated high-level development plan (`docs/<project>-high-level-plan.md`)
- AI-generated per-phase developer plans (`docs/plans/YYYY-MM-DD-phase-<N>-<title>.md`)
- Session persistence with automatic resume: re-running cobuild in the same directory picks up where you left off
- Retry logic with configurable attempt limits for all generation stages
- Structured validation of all generated artifacts before they are accepted
- Atomic file writes to prevent partial or corrupted output
- Daily log files at `~/.cobuild/logs/` with full debug output and session IDs
- Session files at `~/.cobuild/sessions/` with schema versioning

## Requirements

- Node.js >= 18.0.0
- [Ollama](https://ollama.com) running locally at `http://localhost:11434`
- A model pulled and available in Ollama (e.g. `ollama pull llama3`)

## Installation

```sh
npm install -g cobuild
```

## Known limitations

See the [Known Limitations](README.md#known-limitations) section of the README for a full list.

## Upgrade notes

This is the initial release; there is no prior version to upgrade from.
