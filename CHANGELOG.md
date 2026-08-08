# Changelog

All notable changes to this project are documented here.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

No versioned release has been made yet. NODUS is pre-alpha.

### Added

- Tauri 2 + React + TypeScript application shell.
- Interactive node/edge graph canvas (drag, zoom, pan, minimap) with
  custom prompt/response node rendering.
- SQLite-backed local persistence — workspace, session, node, and edge
  data survive an application restart.
- Node creation, branching, inline editing, copying, and deletion (with
  a choice between cascading a branch or reparenting its children).
- A pure, tested branch-context builder: ancestor chain to the root,
  chronological order, sibling branches excluded.
- A deterministic, offline mock AI provider: streamed generation,
  genuine mid-stream cancellation, structured suggested-branch
  responses with schema validation and safe fallback repair, and
  click-to-branch-and-generate chaining.
- Community and contributor infrastructure: `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, issue and PR
  templates, Dependabot configuration, CI workflow.
