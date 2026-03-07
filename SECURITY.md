# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in cobuild, please do not open a public GitHub issue.

Instead, report it privately by emailing the maintainer directly. You can find contact information on the GitHub profile for this repository's owner.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant versions or environment details

You can expect an acknowledgement within a few business days. We will work with you to understand and address the issue before any public disclosure.

## Scope

cobuild is a local CLI tool that:
- Shells out to locally installed AI providers (Ollama, Codex CLI)
- Reads and writes files under `~/.cobuild/` and the current working directory
- Does not transmit data to any external service directly

Security reports related to prompt injection, file path traversal, or unsafe handling of provider output are in scope.
