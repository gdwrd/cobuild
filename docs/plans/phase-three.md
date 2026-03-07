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

- [ ] Create spec system prompt definition
- [ ] Implement prompt builder for spec generation
- [ ] Ensure interview transcript is included as input
- [ ] Ensure prompt uses clean model context
- [ ] Implement prompt metadata logging
- [ ] Add unit tests for prompt builder

---

### Task 3: Implement Spec Generation Module

- [ ] Implement spec generator module
- [ ] Send generation request to provider layer
- [ ] Capture model response
- [ ] Normalize generation output
- [ ] Log raw request and response payloads
- [ ] Persist generation attempts count

---

### Task 4: Implement Spec Structure Validator

- [ ] Implement Markdown structure validation
- [ ] Verify presence of required sections:
  - project overview / description
  - functional requirements
  - acceptance criteria
- [ ] Return structured validation result
- [ ] Reject invalid generation output
- [ ] Log validation errors

---

### Task 5: Implement File Output System for Artifacts

- [ ] Implement docs directory creation if missing
- [ ] Implement filename generation from project name
- [ ] Implement filename sanitization
- [ ] Implement collision detection
- [ ] Implement numeric suffixing for collisions
- [ ] Implement safe Markdown file writing
- [ ] Log file creation attempts

---

### Task 6: Persist Generated Artifact to Session

- [ ] Store generated spec Markdown in session
- [ ] Store file output path in session
- [ ] Mark spec artifact as generated
- [ ] Persist updated session state
- [ ] Log artifact persistence event

---

### Task 7: Implement Generation Status UI

- [ ] Implement artifact generation screen
- [ ] Display "creating file" animation
- [ ] Display generation progress indicator
- [ ] Display success confirmation message
- [ ] Display saved file path
- [ ] Ensure document content is not printed in terminal

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
