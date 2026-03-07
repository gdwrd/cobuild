# Plan: cobuild Phase 2 – Interview Engine

## Overview

This phase implements the complete interactive interview workflow for cobuild.

The CLI must conduct a guided AI interview in the terminal where the model asks exactly one question at a time and sees the full conversation history. The user answers each question until the model decides enough information has been collected or the user triggers `/finish-now`.

This phase introduces:

- session resolution and restore behavior
- append-only interview message persistence
- interactive interview loop
- slash command handling
- Ollama provider integration
- model switching
- retry behavior for model requests
- polished interview UX

No artifact generation is implemented yet. The phase ends when the CLI can run a full interview session and reach the point where spec generation would begin.

## Validation Commands

- npm run build
- npm run lint
- npm test
- node dist/cli/index.js
- node dist/cli/index.js --new-session

---

### Task 1: Implement Session Resolution and Resume Logic

- [x] Implement session lookup by working directory
- [x] Implement `findLatestByWorkingDirectory` session method
- [x] Detect unfinished sessions
- [x] Implement logic for `--new-session` flag
- [x] Automatically start a new session if latest session is completed
- [x] Persist newly created session to disk
- [x] Log session resolution decisions

---

### Task 2: Implement Restored Session UX

- [x] Create restored-session screen component
- [x] Display message indicating session restoration
- [x] Display current progress stage
- [x] Display current phase progress if applicable
- [x] Ensure prior chat history is not rendered in UI
- [x] Wait for user to press Enter before continuing
- [x] Log restore continuation event

---

### Task 3: Implement Interview Transcript Model

- [x] Define interview message schema
- [x] Add transcript structure to session schema
- [x] Implement append-only message storage
- [x] Persist transcript after each turn
- [x] Add timestamps to interview messages
- [x] Implement transcript retrieval helper
- [x] Log interview turn events

---

### Task 4: Implement Interview Controller

- [x] Create interview controller module
- [x] Implement interview loop logic
- [x] Send full transcript to model on each turn
- [x] Ensure model responses appear only after completion
- [x] Prevent multi-question responses from advancing incorrectly
- [x] Stop interview when model indicates completion
- [x] Persist session after each turn

---

### Task 5: Implement Interview Prompt Orchestration

- [x] Implement fixed interview system prompt
- [x] Inject user project idea into first prompt
- [x] Ensure full conversation history is included in model input
- [x] Implement prompt builder utilities
- [x] Implement prompt-too-large detection
- [x] Log prompt orchestration events

---

### Task 6: Implement Slash Command Router

- [x] Detect slash commands in interview input
- [x] Implement command parsing utility
- [x] Ensure commands are intercepted by CLI
- [x] Prevent commands from being sent as model messages
- [x] Route commands to handlers
- [x] Log command usage

---

### Task 7: Implement `/finish-now` Command

- [x] Implement `/finish-now` command handler
- [x] Stop normal interview questioning
- [x] Generate finish-now prompt
- [x] Send final prompt instructing model to infer missing details
- [x] Mark interview as completed in session
- [x] Persist completion state

---

### Task 8: Implement `/model` Command

- [x] Implement model listing via Ollama provider
- [x] Display installed models to the user
- [x] Allow user to select a new model
- [x] Persist selected model in session
- [x] Ensure interview transcript remains unchanged
- [x] Continue interview with selected model

---

### Task 9: Implement `/provider` Command

- [x] Implement `/provider` command handler
- [x] Display informational message
- [x] Show that only Ollama is supported in v1
- [x] Log command invocation

---

### Task 10: Implement Ollama Provider Integration

- [x] Implement Ollama provider module
- [x] Implement model listing API call
- [x] Implement text generation API call
- [x] Normalize provider responses
- [x] Capture raw request/response for logging
- [x] Add provider error handling

---

### Task 11: Implement Retry Executor for Model Requests

- [x] Implement retry wrapper utility
- [x] Retry failed model requests up to 5 times
- [x] Log retry attempts
- [x] Surface retry UI action when attempts exhausted
- [x] Persist error state in session

---

### Task 12: Implement Interview UI Experience

- [x] Render transcript messages in UI
- [x] Implement thinking animation while awaiting model response
- [x] Display available slash commands in footer
- [x] Display transient error messages
- [x] Ensure input box remains responsive

---

### Task 13: Persist Interview Completion State

- [x] Mark interview as completed in session schema
- [x] Store whether interview ended via `/finish-now`
- [x] Update session stage to `spec`
- [x] Persist session state
- [x] Log interview completion event

---

### Task 14: Add Integration Tests for Interview Workflow

- [x] Test new session interview start
- [x] Test restored session continuation
- [x] Test `/finish-now` behavior
- [x] Test `/model` switching
- [x] Test `/provider` command
- [x] Test retry behavior
- [x] Test session persistence after each turn

---

### Task 15: Verify End-to-End Interview Flow

- [x] Run cobuild in a fresh directory
- [x] Complete a full interview session
- [x] Verify transcript persistence
- [x] Verify slash commands work correctly
- [x] Verify model switching works mid-interview
- [x] Verify logs capture model I/O
- [x] Verify interview ends correctly and stage transitions to spec
