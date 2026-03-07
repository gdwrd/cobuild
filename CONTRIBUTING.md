# Contributing to cobuild

## Local setup

1. Clone the repository and install dependencies:

   ```
   git clone https://github.com/gdwrd/cobuild.git
   cd cobuild
   npm install
   ```

2. Build the project:

   ```
   npm run build
   ```

3. Run tests:

   ```
   npm test
   ```

## Validation commands

Before submitting a pull request, run the full validation suite:

```
npm run build
npm test
npm run lint
npm run typecheck
node scripts/verify-package-contents.mjs
bash scripts/smoke-test.sh
```

All checks must pass with no errors. The last two match what CI runs on every PR.

## Pull request expectations

- Keep changes focused. Each PR should address a single concern.
- Include tests for new behavior. Tests live at `src/<module>/__tests__/<file>.test.ts`.
- Do not introduce new lint or type errors.
- Update relevant documentation if your change affects user-visible behavior or project structure.
- Write clear commit messages that explain the motivation for the change.

## Project structure

See `CLAUDE.md` for a detailed breakdown of source modules, architectural patterns, and non-obvious behaviors.

## Reporting issues

Use the GitHub issue tracker at https://github.com/gdwrd/cobuild/issues.
