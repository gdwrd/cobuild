# Plan: cobuild Phase 6 – Hardening and Release Readiness

## Overview

This phase focuses on stabilizing cobuild for real-world use and preparing it for its first public release.

All core functionality (interview, spec generation, architecture generation, high-level plan generation, and per-phase dev plan generation) is already implemented by the end of Phase 5. Phase 6 ensures the system behaves reliably under failure conditions and that runtime behavior is hardened.

Key goals of this phase:

- improve robustness of session persistence and recovery
- harden filesystem interactions and filename handling
- implement prompt size detection and failure behavior
- improve retry exhaustion flows
- finalize restored-session UX
- ensure logging completeness and consistency
- add integration tests
- validate npm global installation and CLI packaging

This phase does not introduce new user-facing features. It focuses on reliability, error handling, observability, and release preparation.

## Validation Commands

- npm run build
- npm run lint
- npm test
- npm run integration-test
- npm pack
- npm link
- cobuild

---

### Task 1: Implement Session Schema Versioning

- [x] Add `schemaVersion` field to session schema
- [x] Define initial schema version constant
- [x] Implement session migration loader
- [x] Implement default value handling for missing fields
- [x] Log migration operations
- [x] Add tests for session schema loading

---

### Task 2: Harden Session Persistence

- [x] Ensure session writes use atomic temp-file + rename pattern
- [x] Detect partial or corrupted session files
- [x] Implement safe JSON parsing with validation
- [x] Handle corrupted sessions gracefully
- [x] Log session load failures
- [x] Add tests for corrupted session recovery

---

### Task 3: Improve Error Handling Framework

- [x] Expand structured error types
- [x] Implement centralized error mapping
- [x] Improve CLI error presentation
- [x] Prevent stack traces from appearing in normal UI output
- [x] Ensure errors are logged with full details
- [x] Add tests for error mapping logic

---

### Task 4: Harden File System Operations

- [x] Verify directory creation behavior
- [x] Ensure filename sanitization handles unsafe characters
- [x] Improve collision handling edge cases
- [x] Validate path normalization
- [x] Add tests for file utilities

---

### Task 5: Implement Prompt Size Detection

- [x] Estimate prompt size before provider request
- [x] Detect when interview transcript becomes too large
- [x] Abort generation with clear user message
- [x] Instruct user to finish interview using `/finish-now`
- [x] Log prompt size failures
- [x] Add tests for prompt size detection

---

### Task 6: Improve Retry Exhaustion UX

- [x] Implement retry exhaustion UI state
- [x] Provide interactive retry option
- [x] Provide exit option
- [x] Persist retry exhaustion state in session
- [x] Log retry exhaustion events
- [x] Add tests for retry exhaustion flow

---

### Task 7: Finalize Restored Session UX

- [x] Improve restored-session screen layout
- [x] Display current stage clearly
- [x] Display dev plan progress when applicable
- [x] Ensure previous transcript is not rendered
- [x] Ensure Enter continues session
- [x] Log restore events

---

### Task 8: Improve Logging Coverage

- [x] Ensure all major events are logged:
  - stage transitions
  - slash command usage
  - model changes
  - file creation
  - retries
  - runtime errors
- [x] Verify logs contain timestamps
- [x] Verify logs contain session IDs
- [x] Verify raw provider requests and responses are captured
- [x] Add logging tests

---

### Task 9: Add End-to-End Integration Tests

- [x] Test fresh session workflow
- [x] Test restored session workflow
- [x] Test full artifact pipeline
- [x] Test dev plan resume after partial completion
- [x] Test retry exhaustion scenarios
- [x] Test prompt-too-large failure path

---

### Task 10: Validate npm Packaging

- [ ] Build distributable package
- [ ] Test `npm pack` output
- [ ] Install package globally via npm
- [ ] Verify `cobuild` command works globally
- [ ] Verify required dependencies are bundled correctly
- [ ] Test uninstall and reinstall behavior

---

### Task 11: Perform Final QA Pass

- [ ] Run full workflow multiple times
- [ ] Verify artifact files are created correctly
- [ ] Verify logs capture all operations
- [ ] Verify session resume behavior
- [ ] Verify failure paths are clear and recoverable
- [ ] Verify CLI UX clarity

---

### Task 12: Prepare Release Documentation

- [ ] Write README with installation instructions
- [ ] Document CLI usage and workflow
- [ ] Document supported slash commands
- [ ] Document session and log locations
- [ ] Document known limitations of v1
- [ ] Prepare initial release notes

---

### Task 13: Final Release Validation

- [ ] Install cobuild globally from npm package
- [ ] Run cobuild from a fresh project folder
- [ ] Complete full workflow from interview to dev plans
- [ ] Verify artifacts are written to docs directories
- [ ] Verify logs and sessions are created
- [ ] Confirm application exits cleanly
