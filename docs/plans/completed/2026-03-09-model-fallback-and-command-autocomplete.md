# Plan: Resilient model fallback and interview command autocomplete

## Validation Commands
- `npm run build`
- `npm test`

### Task 1: Remove hardcoded Ollama model assumptions from session and provider bootstrap
- [x] Audit every `llama3` fallback in startup, session loading, provider creation, and provider switching so Ollama sessions can exist without a preselected model.
- [x] Introduce a single model resolution path for Ollama that distinguishes between "no model chosen yet" and "chosen model name", instead of silently defaulting to `llama3`.
- [x] Update `createProvider`, `ScreenController`, and `/provider` handling so switching into Ollama does not inject a missing default model into the session.
- [x] Add or update focused tests in `src/providers/__tests__/factory.test.ts`, `src/session/__tests__/session.test.ts`, and `src/ui/__tests__/ScreenController.test.tsx` to cover Ollama sessions with no saved model.

### Task 2: Auto-select the first available Ollama model when the saved/default model is unavailable
- [x] Add Ollama-specific model resolution that lists installed models before the first interview turn and chooses the first available model when the session has no valid model yet.
- [x] Define the fallback behavior for resumed sessions whose saved Ollama model is missing: keep the session running, switch to the first installed model, persist that update, and surface a notice in the UI explaining what happened.
- [x] Preserve non-fatal behavior when Ollama is reachable but has zero installed models by keeping the app interactive, showing actionable guidance, and avoiding a crash before `/provider` or manual recovery is possible.
- [x] Add coverage in `src/providers/__tests__/ollama.test.ts`, `src/interview/__tests__/model-command.test.ts`, `src/ui/__tests__/ScreenController.test.tsx`, and any startup tests needed to verify first-model fallback, missing-model recovery, and empty-model-list messaging.

### Task 3: Fix interview input editing so deletion works reliably while typing
- [x] Rework the interview input state handling in `src/ui/App.tsx` so insert, backspace, delete, cursor motion, and submit all operate on the latest buffer state even during rapid keypresses.
- [x] Verify the implementation handles empty input, mid-string edits, repeated delete/backspace presses, and transitions between normal typing and model-picker mode without dropping characters or leaving stale cursor positions.
- [x] Extend `src/ui/__tests__/App.test.tsx` with keyboard interaction tests that reproduce the current deletion bug and lock in the corrected editing behavior.

### Task 4: Add slash-command autocomplete and keyboard selection in the interview input
- [x] Refactor slash-command metadata in `src/interview/commands.ts` into a structured source that can drive parsing, `/help`, footer hints, and autocomplete labels without duplicating command definitions.
- [x] Add interview input autocomplete state that activates when the buffer starts with `/`, filters matching commands as the user types, highlights a current selection, and lets Up/Down arrows move through suggestions.
- [x] Make Enter execute the highlighted command when autocomplete is open, while preserving existing behavior for fully typed commands, normal message submission, and model-picker interactions.
- [x] Render the command suggestion list inline with the interview input using clear selected-state styling and concise usage text modeled after CLI command palettes.
- [x] Add tests in `src/ui/__tests__/App.test.tsx` and any command-parser tests needed to cover filtering, arrow navigation, Enter-to-run behavior, cancellation/escape behavior, and fallback to `/help` for unknown commands.

### Task 5: Update documentation and perform end-to-end verification
- [x] Update `README.md` to document automatic first-model fallback, the zero-model Ollama experience, fixed editing keys, and slash-command autocomplete/navigation behavior.
- [x] Review any existing architecture or UX notes that still describe `llama3` as an unconditional default and align them with the new runtime behavior.
- [x] Run `npm run build` and `npm test`, then manually verify three terminal flows: Ollama installed without `llama3`, Ollama with no models installed, and interview command autocomplete/editing in a live TTY session.
