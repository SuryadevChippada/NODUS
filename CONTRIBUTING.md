# Contributing to NODUS

NODUS is pre-alpha. APIs, data formats, and the UI are all expected to
change without notice. Expect rough edges.

## Before you start

- Check open [Issues](https://github.com/SuryadevChippada/NODUS/issues)
  and [Discussions](https://github.com/SuryadevChippada/NODUS/discussions)
  to avoid duplicate work.
- For anything beyond a small fix, open an issue or discussion first to
  agree on the approach before writing code.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current stack
  and status.

## Development setup

Prerequisites: Node.js, Rust (via [rustup](https://rustup.rs)), and the
platform build tools required by
[Tauri's prerequisites guide](https://tauri.app/start/prerequisites/).

```
git clone https://github.com/SuryadevChippada/NODUS.git
cd NODUS
npm install
npm run tauri dev
```

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused — one logical change per pull request.
3. Match the existing code style. Run formatting, linting, and type
   checking for anything you touch before opening a PR.
4. Add or update tests for behavior you change, where practical at this
   stage of the project.
5. Write a clear PR description: what changed and why.

## Pull requests

- Fill in the pull request template.
- Keep PRs small enough to review in one sitting when possible.
- A maintainer will review and may request changes. Please be patient —
  this is currently maintained part-time.

## Reporting bugs and requesting features

Use the issue templates. They ask for the information needed to act on a
report — please don't skip sections.

## Security

Do not open a public issue for a security vulnerability. See
[SECURITY.md](SECURITY.md).

## Privacy

Never paste API keys, access tokens, full prompts containing personal
information, or model files into issues, discussions, or PRs.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
