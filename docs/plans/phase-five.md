# Plan: cobuild Phase 5 – Per-Phase Ralphex Dev Plan Generation

## Overview

This phase implements the final artifact stage of cobuild: generation of **per-phase ralphex development plans**.

After the high-level plan is successfully generated and validated, the CLI asks the user whether to generate dev plans.

If the user answers **no**, the application terminates immediately.

If the user answers **yes**, cobuild must:

1. Parse the high-level plan phases (already extracted in Phase 4).
2. Generate **one ralphex plan per phase**.
3. Generate plans **sequentially**, never in batch.
4. Save each plan under `docs/plans/`.
5. Update session progress after each successful plan.
6. Include **all prior documents and previously generated phase plans** in the model context.
7. Ensure each plan contains **only work relevant to the current phase**.

Each plan must follow the required ralphex structure:

- `# Plan: <title>`
- `## Overview`
- `## Validation Commands`
- `### Task N:` sections
- checkbox tasks

Plans must contain **no code snippets** and must be detailed enough for direct execution.

If generation fails:
- retry up to **5 times**
- if retries fail, **stop further generation**
- persist session progress so the remaining phases can be resumed later.

This phase completes the full artifact pipeline for cobuild.

## Validation Commands

- npm run build
- npm run lint
- npm test
- node dist/cli/index.js
- node dist/cli/index.js --new-session

---

### Task 1: Extend Artifact Pipeline for Dev Plans

- [x] Add dev plan stage to artifact pipeline
- [x] Implement workflow prompt asking user whether to generate dev plans
- [x] Implement immediate termination when user answers "no"
- [x] Implement continuation when user answers "yes"
- [x] Persist workflow decision in session
- [x] Log dev plan stage start

---

### Task 2: Load Phase Metadata

- [x] Load extracted phases from session state
- [x] Validate phase metadata availability
- [x] Validate phase count is within 4–8
- [x] Prepare sequential phase iterator
- [x] Log phase initialization

---

### Task 3: Implement Dev Plan Prompt Builder

- [x] Create ralphex dev plan system prompt
- [x] Inject required context into prompt:
  - spec
  - architecture
  - high-level plan
  - previously generated dev plans
  - current phase metadata
- [x] Ensure clean AI generation context
- [x] Ensure prompt instructs model to produce only phase-specific work
- [x] Log prompt metadata

---

### Task 4: Implement Dev Plan Generator

- [x] Create dev plan generator module
- [x] Send generation request to provider
- [x] Normalize generation output
- [x] Capture raw request and response for logging
- [x] Track generation attempts
- [x] Return generated Markdown plan

---

### Task 5: Implement Ralphex Plan Validator

- [x] Validate presence of required sections:
  - `# Plan:`
  - `## Overview`
  - `## Validation Commands`
- [x] Validate task sections use `### Task N:` or `### Iteration N:`
- [x] Validate tasks are Markdown checkboxes
- [x] Reject plans containing code snippets
- [x] Ensure plan content references only the current phase
- [x] Log validation failures

---

### Task 6: Implement Dev Plan File Writer

- [x] Ensure `docs/plans/` directory exists
- [x] Generate filename using format:
  `YYYY-MM-DD-phase-<number>-<title>.md`
- [x] Sanitize filename for filesystem safety
- [x] Detect collisions
- [x] Apply numeric suffix if needed
- [x] Write Markdown file
- [x] Log file creation

---

### Task 7: Persist Phase Completion

- [x] Store dev plan Markdown in session
- [x] Store plan file path
- [x] Increment completed phase counter
- [x] Persist session state after each plan
- [x] Log phase completion

---

### Task 8: Implement Sequential Phase Loop

- [x] Implement loop over phases
- [x] Generate plan for phase 1..N sequentially
- [x] Update current phase state in session
- [x] Ensure generation waits for previous phase completion
- [x] Display UI progress for each phase

---

### Task 9: Implement Retry Handling for Phase Generation

- [x] Integrate retry executor with dev plan generator
- [x] Retry failed generation up to 5 times
- [x] Log retry attempts
- [x] Persist attempt count in session
- [x] Surface retry UI on exhaustion

---

### Task 10: Implement Failure Stop Behavior

- [ ] Stop further phase generation after retry exhaustion
- [ ] Persist remaining phase state
- [ ] Allow session to resume from failed phase
- [ ] Log generation halt event

---

### Task 11: Implement Dev Plan Generation UI

- [ ] Display phase progress indicator
- [ ] Display generation animation
- [ ] Display file creation confirmation
- [ ] Display saved file path
- [ ] Ensure plan contents are not printed in terminal

---

### Task 12: Implement Resume Logic for Dev Plans

- [ ] Detect incomplete dev plan generation during resume
- [ ] Resume generation from first incomplete phase
- [ ] Load previously generated plans
- [ ] Continue sequential loop from stored phase
- [ ] Log resume event

---

### Task 13: Add Integration Tests

- [ ] Test dev plan generation after high-level plan
- [ ] Test generation of multiple phases
- [ ] Test retry behavior
- [ ] Test stop on unrecoverable phase failure
- [ ] Test resume after partial generation
- [ ] Test filename collision handling

---

### Task 14: Verify End-to-End Dev Plan Pipeline

- [ ] Run cobuild from a fresh directory
- [ ] Complete interview, spec, architecture, and high-level plan stages
- [ ] Select "yes" for dev plan generation
- [ ] Verify each phase plan appears under `docs/plans/`
- [ ] Verify plan structure matches ralphex format
- [ ] Verify session state tracks phase progress
- [ ] Verify logs capture generation events
