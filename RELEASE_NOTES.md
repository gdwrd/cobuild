# cobuild v0.1.4 — Release Notes

## Overview

cobuild v0.1.4 adds persistent global provider settings, tighter provider/model UX rules, and branded startup/interview presentation. It keeps the interactive CLI workflow intact while making startup state and provider switching more predictable across sessions.

## What's included

- Global settings persisted under `~/.cobuild/settings.json`, including the default provider selection
- Startup now loads global settings before restoring or creating a session, so provider choice is stable across runs
- `/provider` updates both the active session and the persisted default provider
- Provider-specific model handling is stricter: Codex CLI no longer shows a misleading model name in the header, while Ollama continues to show the active model
- Branded ASCII cobuild logo added to the interview experience with regression tests covering visibility
- Expanded automated coverage for settings persistence, provider switching, model display rules, and branded UI rendering
- Existing workflow remains intact: interactive interview, artifact generation, resume support, retry logic, and atomic persistence

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

Upgrade from v0.1.3 by installing the new version. Existing sessions continue to work, and `~/.cobuild/settings.json` will be created automatically when settings are first persisted.
