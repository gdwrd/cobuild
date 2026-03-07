# Plan: Release readiness for cobuild

## Validation Commands
- `npm run build`
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm pack --dry-run --cache /tmp/cobuild-npm-cache`

### Task 1: Complete package metadata for public distribution
- [x] Add `license` to `package.json`.
- [x] Add `repository`, `homepage`, and `bugs` entries in `package.json` that point to the GitHub repository.
- [x] Add a focused `keywords` list in `package.json` for npm discoverability.
- [x] Decide whether to add `author` metadata in `package.json`.
- [x] Add a `prepublishOnly` script in `package.json` that runs the required release validation commands.

### Task 2: Add the missing baseline repository files
- [x] Add a root `LICENSE` file.
- [x] Add `CONTRIBUTING.md` with local setup, validation commands, and pull request expectations.
- [x] Add `SECURITY.md` with a basic vulnerability reporting path.
- [x] Add a minimal `.github/` baseline, including at least a bug report issue template.

### Task 3: Bring public documentation in sync with current behavior
- [x] Update `README.md` so startup behavior matches the current implementation where cobuild can launch even if no provider is installed.
- [x] Update `README.md` to document provider switching with `/provider`.
- [x] Update `README.md` to document the current `/model` behavior, including manual model overrides when model listing is unavailable.
- [x] Add a troubleshooting section to `README.md` for common Ollama and Codex CLI failures.
- [x] Update `RELEASE_NOTES.md` so it reflects current multi-provider functionality instead of the older Ollama-only release description.

### Task 4: Clean up repository and publish-surface hygiene
- [x] Decide whether `CLAUDE.md`, `skills/`, and tracked `docs/plans/completed/` content should remain in the public repository.
- [x] Reconcile `.gitignore` with the current tracking of `docs/`.
- [x] Decide whether `RELEASE_NOTES.md` should be renamed or complemented with a conventional `CHANGELOG.md`.
- [x] Verify the publish surface using `package.json`, `.npmignore`, and `npm pack --dry-run`, and remove any unintended package contents.

### Task 5: Add continuous integration for pull requests and pushes
- [x] Add a GitHub Actions workflow under `.github/workflows/` that runs `npm ci`, `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck`.
- [x] Choose an appropriate Node.js version matrix for supported releases.
- [x] Ensure CI does not depend on Ollama or Codex CLI being installed.
- [x] Make CI fail fast on packaging or TypeScript regressions that would block release.

### Task 6: Add release automation for GitHub and npm
- [x] Add a release workflow under `.github/workflows/` for tagged releases.
- [x] Decide whether npm publishing will be manual or automated from GitHub Actions.
- [x] If npm publishing is automated, wire the required npm token and permissions into the release workflow.
- [x] Ensure the release workflow publishes only after build and test validation passes.

### Task 7: Add install and package smoke checks
- [ ] Add a smoke check that installs the packed tarball and verifies `cobuild --help`.
- [ ] Verify that the published package contains only intended runtime files.
- [ ] Document the release verification steps in the repository so future releases follow the same flow.

### Task 8: Run the final release pass
- [ ] Run the full validation command set on a clean working tree.
- [ ] Review `npm pack --dry-run --cache /tmp/cobuild-npm-cache` output one final time before release.
- [ ] Finalize release notes for the actual shipped scope.
- [ ] Create the release tag and publish the GitHub release only after CI is green.
