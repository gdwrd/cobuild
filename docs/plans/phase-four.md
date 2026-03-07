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

- [ ] Extend artifact pipeline to support post-spec decision flow
- [ ] Implement architecture generation prompt step
- [ ] Implement high-level plan generation prompt step
- [ ] Enforce fixed order of stages
- [ ] Ensure CLI controls stage transitions
- [ ] Persist workflow decisions in session
- [ ] Log workflow decision events

---

### Task 2: Implement Yes/No Prompt UI

- [ ] Create reusable yes/no prompt component
- [ ] Display question after spec generation
- [ ] Handle user keyboard input for selection
- [ ] Return boolean decision to workflow controller
- [ ] Display confirmation feedback
- [ ] Log user decision events

---

### Task 3: Implement Architecture Prompt Builder

- [ ] Create architecture system prompt
- [ ] Ensure prompt uses clean AI session
- [ ] Inject spec document as only context
- [ ] Ensure interview transcript is not included
- [ ] Add prompt metadata logging
- [ ] Add unit tests for prompt builder

---

### Task 4: Implement Architecture Generator

- [ ] Create architecture generator module
- [ ] Send generation request via provider layer
- [ ] Normalize generation output
- [ ] Capture raw request/response for logging
- [ ] Persist generation attempt counts
- [ ] Return generated architecture markdown

---

### Task 5: Implement Architecture Structure Validator

- [ ] Validate presence of required sections:
  - system components
  - data flow
  - external integrations
  - storage choices
  - deployment/runtime model
  - security considerations
  - failure handling
- [ ] Return structured validation result
- [ ] Reject invalid architecture output
- [ ] Log validation errors

---

### Task 6: Implement Architecture File Output

- [ ] Generate architecture filename using project name
- [ ] Apply filename sanitization
- [ ] Detect filename collisions
- [ ] Apply numeric suffix if needed
- [ ] Write Markdown file under `docs/`
- [ ] Log file write operations

---

### Task 7: Persist Architecture Artifact in Session

- [ ] Store architecture Markdown in session
- [ ] Store artifact file path
- [ ] Mark architecture artifact as generated
- [ ] Persist session state
- [ ] Log artifact persistence event

---

### Task 8: Implement High-Level Plan Prompt Builder

- [ ] Create high-level plan system prompt
- [ ] Ensure prompt uses clean AI session
- [ ] Include spec document
- [ ] Include architecture document
- [ ] Ensure no interview transcript contamination
- [ ] Log prompt orchestration metadata
- [ ] Add prompt builder tests

---

### Task 9: Implement High-Level Plan Generator

- [ ] Create high-level plan generator module
- [ ] Send generation request to provider
- [ ] Normalize model response
- [ ] Capture raw request/response for logging
- [ ] Persist generation attempt counts
- [ ] Return generated Markdown

---

### Task 10: Implement High-Level Plan Structure Validator

- [ ] Validate number of phases (4–8)
- [ ] Validate sequential phase ordering
- [ ] Validate required fields in each phase:
  - title
  - goal
  - scope
  - deliverables
  - dependencies
  - acceptance criteria
- [ ] Reject invalid plan structures
- [ ] Log validation errors

---

### Task 11: Implement Phase Extraction Parser

- [ ] Parse validated high-level plan into structured phase objects
- [ ] Extract phase number and title
- [ ] Extract phase metadata fields
- [ ] Persist extracted phases for future dev plan generation
- [ ] Add unit tests for phase parser

---

### Task 12: Implement High-Level Plan File Output

- [ ] Generate filename `<project>-high-level-plan.md`
- [ ] Apply filename sanitization
- [ ] Detect collisions and apply numeric suffix
- [ ] Write Markdown file under `docs/`
- [ ] Log file creation events

---

### Task 13: Persist High-Level Plan Artifact in Session

- [ ] Store generated plan Markdown in session
- [ ] Store output file path
- [ ] Persist extracted phase metadata
- [ ] Mark artifact generation status
- [ ] Persist session state
- [ ] Log artifact persistence

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
