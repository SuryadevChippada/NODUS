# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Use GitHub's private vulnerability reporting for this repository:

1. Go to the
   [Security tab](https://github.com/SuryadevChippada/NODUS/security).
2. Select **Report a vulnerability**.
3. Describe the issue, including steps to reproduce and its potential
   impact.

This opens a private conversation with the maintainer so the issue can be
assessed and fixed before any public disclosure.

## Scope

NODUS is a local-first desktop application. Reports are especially
welcome for:

- Any path that reads, writes, or executes data outside what a user
  explicitly requested (arbitrary filesystem access, command execution)
- Ways secrets (API keys) could leak into logs, exports, or version
  control
- Rendering of untrusted content (Markdown, model output) that could
  execute scripts or reach outside the sandboxed webview
- Local server components binding to more than `127.0.0.1`

## Supported versions

NODUS is pre-alpha. There are no tagged releases yet, and no versions
currently receive security backports. Reports apply to the current `main`
branch.

## Disclosure

There is currently no fixed disclosure timeline given the pre-alpha status
of the project. The maintainer will coordinate a reasonable disclosure
timeline with the reporter once a report is triaged.
