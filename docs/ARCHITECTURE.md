# NODUS Architecture

## Status

Pre-alpha. Phase 0 complete: a blank Tauri + React + TypeScript shell is
scaffolded and verified running locally. No product features are
implemented yet.

## Stack (verified working versions, 2026-08-06, macOS 26.5.2 / Apple Silicon)

- Tauri 2.11.5 (Rust 1.92.0, cargo 1.92.0, rustup 1.28.2)
- React 19.1.0 + TypeScript ~5.8.3 + Vite 7.3.6
- Package manager: npm 11.6.2
- Target verified: `aarch64-apple-darwin`, Xcode 26.6 command line tools

## Planned additions (not yet implemented)

- `@xyflow/react` for the node graph canvas (Phase 1)
- SQLite via the official Tauri SQL plugin for local persistence (Phase 2)
- Zustand for client state, Zod for schema validation
- Tailwind CSS for styling
- Vitest + React Testing Library for tests
- Model provider adapters (mock, Ollama, OpenAI-compatible local server,
  OpenAI, Anthropic, managed llama.cpp) behind one typed interface
  (Phases 3-4)

## Decisions

- Package manager: npm. Already installed with Node, zero setup cost;
  yarn was not installed and pnpm offered no advantage for this project.
- Renamed the `create-tauri-app` default `tauri-app` placeholder identity
  to `nodus` across `package.json`, `src-tauri/Cargo.toml` (package and
  lib crate name), `src-tauri/src/main.rs`, and
  `src-tauri/tauri.conf.json` (`productName`, window `title`).
- Bundle identifier: `com.nodus.app`.

## Directory layout

- `src/` — React frontend (Vite)
- `src-tauri/` — Rust backend (Tauri commands, window configuration)
- `docs/` — project documentation
