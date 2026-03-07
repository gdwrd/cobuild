# Plan: cobuild Phase 4 – Architecture and High-Level Plan Pipeline

## Overview

This phase implements the second stage of the artifact pipeline: generation of the **architecture document** and the **high-level development plan**.

After the project spec is generated, the CLI must follow the fixed post-spec flow:

1. Ask whether to generate the architecture document.
2. If the user answers **no**, terminate immediately.
3. If **yes**, generate the architecture document using **only the spec** as model context.
4. After architecture generation, ask whether to generate the high-level plan.
5. If the user answers **no**, terminate immediately.
6. If **yes**, generate the high-level plan using **spec + architecture** as context.

The high-level plan must contain **4–8 sequential phases**, each with the required structure:

- title  
- goal  
- scope  
- deliverables  
- dependencies  
- acceptance criteria  

This phase also introduces **phase extraction**, which parses the generated plan into structured phase objects for use in Phase 5 (per-phase ralphex plan generation).

The artifact pipeline, validation logic, UI status flow, and session persistence patterns established in Phase 3 must be reused.

## Validation Commands

- npm run build
- npm run lint
- npm test
- node dist/cli/index.js
- node dist/cli/index.js --new-session

---

### Task 1: Implement Post-Spec Workflow Controller

- [x] Extend artifact pipeline to support post-spec decision flow
- [x] Implement architecture generation prompt step
- [x] Implement high-level plan generation prompt step
- [x] Enforce fixed order of stages
- [x] Ensure CLI controls stage transitions
- [x] Persist workflow decisions in session
- [x] Log workflow decision events

---

### Task 2: Implement Yes/No Prompt UI

- [x] Create reusable yes/no prompt component
- [x] Display question after spec generation
- [x] Handle user keyboard input for selection
- [x] Return boolean decision to workflow controller
- [x] Display confirmation feedback
- [x] Log user decision events

---

### Task 3: Implement Architecture Prompt Builder

- [x] Create architecture system prompt
- [x] Ensure prompt uses clean AI session
- [x] Inject spec document as only context
- [x] Ensure interview transcript is not included
- [x] Add prompt metadata logging
- [x] Add unit tests for prompt builder

---

### Task 4: Implement Architecture Generator

- [x] Create architecture generator module
- [x] Send generation request via provider layer
- [x] Normalize generation output
- [x] Capture raw request/response for logging
- [x] Persist generation attempt counts
- [x] Return generated architecture markdown

---

### Task 5: Implement Architecture Structure Validator

- [x] Validate presence of required sections:
  - system components
  - data flow
  - external integrations
  - storage choices
  - deployment/runtime model
  - security considerations
  - failure handling
- [x] Return structured validation result
- [x] Reject invalid architecture output
- [x] Log validation errors

---

### Task 6: Implement Architecture File Output

- [x] Generate architecture filename using project name
- [x] Apply filename sanitization
- [x] Detect filename collisions
- [x] Apply numeric suffix if needed
- [x] Write Markdown file under `docs/`
- [x] Log file write operations

---

### Task 7: Persist Architecture Artifact in Session

- [x] Store architecture Markdown in session
- [x] Store artifact file path
- [x] Mark architecture artifact as generated
- [x] Persist session state
- [x] Log artifact persistence event

---

### Task 8: Implement High-Level Plan Prompt Builder

- [x] Create high-level plan system prompt
- [x] Ensure prompt uses clean AI session
- [x] Include spec document
- [x] Include architecture document
- [x] Ensure no interview transcript contamination
- [x] Log prompt orchestration metadata
- [x] Add prompt builder tests

---

### Task 9: Implement High-Level Plan Generator

- [x] Create high-level plan generator module
- [x] Send generation request to provider
- [x] Normalize model response
- [x] Capture raw request/response for logging
- [x] Persist generation attempt counts
- [x] Return generated Markdown

---

### Task 10: Implement High-Level Plan Structure Validator

- [x] Validate number of phases (4–8)
- [x] Validate sequential phase ordering
- [x] Validate required fields in each phase:
  - title
  - goal
  - scope
  - deliverables
  - dependencies
  - acceptance criteria
- [x] Reject invalid plan structures
- [x] Log validation errors

---

### Task 11: Implement Phase Extraction Parser

- [x] Parse validated high-level plan into structured phase objects
- [x] Extract phase number and title
- [x] Extract phase metadata fields
- [x] Persist extracted phases for future dev plan generation
- [x] Add unit tests for phase parser

---

### Task 12: Implement High-Level Plan File Output

- [x] Generate filename `<project>-high-level-plan.md`
- [x] Apply filename sanitization
- [x] Detect collisions and apply numeric suffix
- [x] Write Markdown file under `docs/`
- [x] Log file creation events

---

### Task 13: Persist High-Level Plan Artifact in Session

- [x] Store generated plan Markdown in session
- [x] Store output file path
- [x] Persist extracted phase metadata
- [x] Mark artifact generation status
- [x] Persist session state
- [x] Log artifact persistence

---

### Task 14: Implement Generation Status UI

- [ ] Reuse artifact generation UI screen
- [ ] Display architecture generation progress
- [ ] Display high-level plan generation progress
- [ ] Display file creation messages
- [ ] Display saved file paths
- [ ] Ensure document contents are not printed

---

### Task 15: Implement Retry Handling for Both Generators

- [ ] Integrate retry executor with architecture generator
- [ ] Integrate retry executor with high-level plan generator
- [ ] Retry generation up to 5 times
- [ ] Log retry attempts
- [ ] Surface retry UI action on exhaustion
- [ ] Persist failure state in session

---

### Task 16: Add Integration Tests for Pipeline

- [ ] Test architecture generation after spec
- [ ] Test immediate exit when user answers "no"
- [ ] Test high-level plan generation after architecture
- [ ] Test plan validator rejects invalid outputs
- [ ] Test phase extraction logic
- [ ] Test filename collision handling

---

### Task 17: Verify End-to-End Phase 4 Workflow

- [ ] Run cobuild from a fresh project directory
- [ ] Complete interview and spec generation
- [ ] Select "yes" for architecture generation
- [ ] Verify architecture file appears in `docs/`
- [ ] Select "yes" for high-level plan generation
- [ ] Verify plan file appears in `docs/`
- [ ] Confirm phases are correctly extracted and stored
- [ ] Verify logs contain stage transitions
