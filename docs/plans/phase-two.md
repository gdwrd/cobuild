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

- [ ] Implement session lookup by working directory
- [ ] Implement `findLatestByWorkingDirectory` session method
- [ ] Detect unfinished sessions
- [ ] Implement logic for `--new-session` flag
- [ ] Automatically start a new session if latest session is completed
- [ ] Persist newly created session to disk
- [ ] Log session resolution decisions

---

### Task 2: Implement Restored Session UX

- [ ] Create restored-session screen component
- [ ] Display message indicating session restoration
- [ ] Display current progress stage
- [ ] Display current phase progress if applicable
- [ ] Ensure prior chat history is not rendered in UI
- [ ] Wait for user to press Enter before continuing
- [ ] Log restore continuation event

---

### Task 3: Implement Interview Transcript Model

- [ ] Define interview message schema
- [ ] Add transcript structure to session schema
- [ ] Implement append-only message storage
- [ ] Persist transcript after each turn
- [ ] Add timestamps to interview messages
- [ ] Implement transcript retrieval helper
- [ ] Log interview turn events

---

### Task 4: Implement Interview Controller

- [ ] Create interview controller module
- [ ] Implement interview loop logic
- [ ] Send full transcript to model on each turn
- [ ] Ensure model responses appear only after completion
- [ ] Prevent multi-question responses from advancing incorrectly
- [ ] Stop interview when model indicates completion
- [ ] Persist session after each turn

---

### Task 5: Implement Interview Prompt Orchestration

- [ ] Implement fixed interview system prompt
- [ ] Inject user project idea into first prompt
- [ ] Ensure full conversation history is included in model input
- [ ] Implement prompt builder utilities
- [ ] Implement prompt-too-large detection
- [ ] Log prompt orchestration events

---

### Task 6: Implement Slash Command Router

- [ ] Detect slash commands in interview input
- [ ] Implement command parsing utility
- [ ] Ensure commands are intercepted by CLI
- [ ] Prevent commands from being sent as model messages
- [ ] Route commands to handlers
- [ ] Log command usage

---

### Task 7: Implement `/finish-now` Command

- [ ] Implement `/finish-now` command handler
- [ ] Stop normal interview questioning
- [ ] Generate finish-now prompt
- [ ] Send final prompt instructing model to infer missing details
- [ ] Mark interview as completed in session
- [ ] Persist completion state

---

### Task 8: Implement `/model` Command

- [ ] Implement model listing via Ollama provider
- [ ] Display installed models to the user
- [ ] Allow user to select a new model
- [ ] Persist selected model in session
- [ ] Ensure interview transcript remains unchanged
- [ ] Continue interview with selected model

---

### Task 9: Implement `/provider` Command

- [ ] Implement `/provider` command handler
- [ ] Display informational message
- [ ] Show that only Ollama is supported in v1
- [ ] Log command invocation

---

### Task 10: Implement Ollama Provider Integration

- [ ] Implement Ollama provider module
- [ ] Implement model listing API call
- [ ] Implement text generation API call
- [ ] Normalize provider responses
- [ ] Capture raw request/response for logging
- [ ] Add provider error handling

---

### Task 11: Implement Retry Executor for Model Requests

- [ ] Implement retry wrapper utility
- [ ] Retry failed model requests up to 5 times
- [ ] Log retry attempts
- [ ] Surface retry UI action when attempts exhausted
- [ ] Persist error state in session

---

### Task 12: Implement Interview UI Experience

- [ ] Render transcript messages in UI
- [ ] Implement thinking animation while awaiting model response
- [ ] Display available slash commands in footer
- [ ] Display transient error messages
- [ ] Ensure input box remains responsive

---

### Task 13: Persist Interview Completion State

- [ ] Mark interview as completed in session schema
- [ ] Store whether interview ended via `/finish-now`
- [ ] Update session stage to `spec`
- [ ] Persist session state
- [ ] Log interview completion event

---

### Task 14: Add Integration Tests for Interview Workflow

- [ ] Test new session interview start
- [ ] Test restored session continuation
- [ ] Test `/finish-now` behavior
- [ ] Test `/model` switching
- [ ] Test `/provider` command
- [ ] Test retry behavior
- [ ] Test session persistence after each turn

---

### Task 15: Verify End-to-End Interview Flow

- [ ] Run cobuild in a fresh directory
- [ ] Complete a full interview session
- [ ] Verify transcript persistence
- [ ] Verify slash commands work correctly
- [ ] Verify model switching works mid-interview
- [ ] Verify logs capture model I/O
- [ ] Verify interview ends correctly and stage transitions to spec
