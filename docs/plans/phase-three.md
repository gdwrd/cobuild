# Plan: cobuild Phase 3 – Spec Generation Pipeline

## Overview

This phase introduces the first artifact generation pipeline for cobuild.

After the interview stage completes, the CLI must automatically generate a project specification document using the interview transcript as input.

The specification is saved as a Markdown document under the project's `docs/` directory. The CLI must handle filename sanitization, collision handling, validation of minimal spec structure, session state updates, and user feedback during generation.

This phase also establishes the reusable artifact generation framework that later phases will extend for architecture, high-level plan, and dev plan generation.

Key capabilities delivered in this phase:

- spec prompt orchestration
- spec generation using interview transcript
- spec validation for minimum required sections
- artifact file writing under `docs/`
- filename sanitization and collision handling
- generation progress UI
- session persistence for spec artifact
- retry behavior for generation failures

The phase is complete when the CLI automatically generates and persists a valid project specification after the interview ends.

## Validation Commands

- npm run build
- npm run lint
- npm test
- node dist/cli/index.js
- node dist/cli/index.js --new-session

---

### Task 1: Implement Artifact Generation Framework

- [x] Create artifact generator module
- [x] Define artifact generation interface
- [x] Implement artifact stage orchestration logic
- [x] Implement stage transition from interview to spec
- [x] Persist stage transitions in session state
- [x] Log artifact pipeline events

---

### Task 2: Implement Spec Prompt Builder

- [x] Create spec system prompt definition
- [x] Implement prompt builder for spec generation
- [x] Ensure interview transcript is included as input
- [x] Ensure prompt uses clean model context
- [x] Implement prompt metadata logging
- [x] Add unit tests for prompt builder

---

### Task 3: Implement Spec Generation Module

- [x] Implement spec generator module
- [x] Send generation request to provider layer
- [x] Capture model response
- [x] Normalize generation output
- [x] Log raw request and response payloads
- [x] Persist generation attempts count

---

### Task 4: Implement Spec Structure Validator

- [x] Implement Markdown structure validation
- [x] Verify presence of required sections:
  - project overview / description
  - functional requirements
  - acceptance criteria
- [x] Return structured validation result
- [x] Reject invalid generation output
- [x] Log validation errors

---

### Task 5: Implement File Output System for Artifacts

- [x] Implement docs directory creation if missing
- [x] Implement filename generation from project name
- [x] Implement filename sanitization
- [x] Implement collision detection
- [x] Implement numeric suffixing for collisions
- [x] Implement safe Markdown file writing
- [x] Log file creation attempts

---

### Task 6: Persist Generated Artifact to Session

- [x] Store generated spec Markdown in session
- [x] Store file output path in session
- [x] Mark spec artifact as generated
- [x] Persist updated session state
- [x] Log artifact persistence event

---

### Task 7: Implement Generation Status UI

- [x] Implement artifact generation screen
- [x] Display "creating file" animation
- [x] Display generation progress indicator
- [x] Display success confirmation message
- [x] Display saved file path
- [x] Ensure document content is not printed in terminal

---

### Task 8: Implement Generation Retry Handling

- [ ] Integrate retry executor with spec generation
- [ ] Retry failed generation up to 5 times
- [ ] Log retry attempts
- [ ] Surface retry UI action on exhaustion
- [ ] Persist failure state in session

---

### Task 9: Handle File Write Failure

- [ ] Detect filesystem write errors
- [ ] Display error message to user
- [ ] Persist error in session state
- [ ] Log write failure details
- [ ] Fail immediately when write fails

---

### Task 10: Implement Stage Completion Logic

- [ ] Update session stage to `spec`
- [ ] Persist stage completion in session
- [ ] Emit stage completion log event
- [ ] Prepare state for architecture stage prompt

---

### Task 11: Add Integration Tests for Spec Pipeline

- [ ] Test spec generation after interview completion
- [ ] Test validator rejects invalid output
- [ ] Test file naming and collision handling
- [ ] Test sanitized filenames
- [ ] Test retry behavior on provider failure
- [ ] Test write failure behavior

---

### Task 12: Verify End-to-End Spec Generation Flow

- [ ] Run cobuild from a fresh folder
- [ ] Complete an interview session
- [ ] Verify spec file is created in `docs/`
- [ ] Verify filename format is correct
- [ ] Verify existing files are not overwritten
- [ ] Verify session state reflects spec completion
- [ ] Verify logs contain generation details
