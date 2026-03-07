# Release Verification

This document describes the steps to verify a cobuild release before and after publishing.

## Pre-release checklist

Run these commands on a clean working tree (no uncommitted changes):

```
npm run build
npm test
npm run lint
npm run typecheck
npm pack --dry-run --cache /tmp/cobuild-npm-cache
node scripts/verify-package-contents.mjs
bash scripts/smoke-test.sh
```

All commands must exit 0 before proceeding.

## What each step checks

**npm run build** — Compiles TypeScript to `dist/` with strict settings. Fails on any type error or missing file.

**npm test** — Runs the full unit test suite with vitest. All tests must pass.

**npm run lint** — ESLint over `src/`. No warnings or errors are acceptable.

**npm run typecheck** — Type-checks the full project including test files. Ensures no type regressions.

**npm pack --dry-run** — Prints what would be published to npm without writing a tarball. Review the file list manually to confirm no source files, test files, or internal docs are included.

**node scripts/verify-package-contents.mjs** — Automated check that the package contains only files under `dist/` and a small set of allowed root files (`package.json`, `README.md`, `LICENSE`, `RELEASE_NOTES.md`). Exits non-zero on any unexpected file.

**bash scripts/smoke-test.sh** — Packs the tarball, installs it in a clean temp directory, then runs `cobuild --help` against the installed binary. Confirms the published artifact is installable and the binary is functional.

## Tagging and publishing

1. Confirm the version in `package.json` matches the intended release tag.
2. Update `RELEASE_NOTES.md` with the shipped scope.
3. Commit any final changes and push to master.
4. Wait for CI to pass on the master branch.
5. Create and push the release tag:

```
git tag v0.x.y
git push origin v0.x.y
```

6. The release GitHub Actions workflow triggers automatically on the tag push. It runs the full validation suite, creates a GitHub Release, and publishes to npm.

## Post-publish verification

After the GitHub Release workflow completes:

1. Check the npm package page to confirm the new version is listed.
2. Install the published version in a fresh directory and verify `cobuild --help` works:

```
mkdir /tmp/cobuild-verify && cd /tmp/cobuild-verify && npm install cobuild@<version> && ./node_modules/.bin/cobuild --help
```

3. Confirm the GitHub Release was created with the correct tag and notes.
