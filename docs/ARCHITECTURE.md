# NODUS Architecture

## Status

Pre-alpha. Implemented so far: the Tauri + React + TypeScript shell, the
interactive node graph canvas, SQLite persistence, node creation /
branching / editing / deletion, a pure ancestor-chain context builder,
and a deterministic mock AI provider with streaming generation,
cancellation, and structured suggested-branch responses. See
[ROADMAP.md](../ROADMAP.md) for what's next.

## Stack (verified working versions, 2026-08-07, macOS / Apple Silicon)

- Tauri 2.11.5 (Rust 1.92.0, cargo 1.92.0, rustup 1.28.2)
- React 19.1.0 + TypeScript ~5.8.3 + Vite 7.3.6
- [@xyflow/react](https://reactflow.dev) 12.11.2 for the graph canvas
- Zustand 5.0.14 for client state
- Zod 4.4.3 for schema validation (graph data, provider responses)
- Tailwind CSS 4 via `@tailwindcss/vite`
- `tauri-plugin-sql` / `@tauri-apps/plugin-sql` 2.4.x — SQLite persistence
- `tauri-plugin-dialog` / `@tauri-apps/plugin-dialog` — native confirm
  dialogs (`window.confirm` does not render in Tauri's webview; this is
  the correct native equivalent)
- Vitest + React Testing Library for tests
- Package manager: npm
- Target verified: `aarch64-apple-darwin`. Other platforms are untested
  — see the platform priority order in [ROADMAP.md](../ROADMAP.md).

## Data model

SQLite tables (migrations in `src-tauri/src/lib.rs`):

- `workspaces` — one row per local workspace
- `sessions` — one saved graph per workspace (currently always exactly
  one, auto-created on first launch; multi-session UI is planned)
- `nodes` — `id`, `session_id`, `type` (`"prompt"` | `"response"`),
  `text`, `position_x`/`position_y`, `suggested_branches` (JSON,
  nullable), timestamps
- `edges` — `id`, `session_id`, `source_node_id`, `target_node_id`,
  `created_at`

SQLite's `ON DELETE CASCADE` is declared on the foreign keys for
documentation but **not enforced** — this Tauri SQL plugin version
exposes no way to turn on `PRAGMA foreign_keys` per connection. Any code
path that deletes a node must explicitly delete its edges too; two such
paths already exist in `src/store/graphStore.ts`
(`deleteNodeWithDescendants`, `deleteNodeAndReparentChildren`) and are
the reference implementation for this constraint.

## AI provider architecture

`src/types/provider.ts` defines the adapter shape every provider
implements: `generate(context, { onToken, signal }) => Promise<ProviderResponse>`,
where a `ProviderResponse` is Zod-validated (`title`, `answer`,
3–5 `suggestedBranches`, optional `summary`). Only `answer` and
`suggestedBranches` are persisted to SQLite today — `title`/`summary`
have no UI consumer yet, so they aren't given a database column.

`src/lib/providers/mockProvider.ts` is the first (and currently only)
implementation — fully offline and deterministic, used to build and
test the whole generation pipeline (streaming, cancellation, structured
suggestions) before any real model is wired in. `parseProviderResponse`
validates a provider's raw output and performs one safe repair (keep a
real answer, replace only malformed branch metadata) before falling
back to local canned branches — built now because a real provider
(Ollama, next) won't always return clean structured output.

Cancellation uses the native `AbortController`/`AbortSignal` — no
cancellation-token library. Streaming persistence is debounced (never
one database write per token) with an immediate flush on completion or
cancellation.

## Directory layout

- `src/` — React frontend (Vite)
  - `components/` — `GraphCanvas`, node components
  - `store/` — the single Zustand `graphStore`
  - `lib/` — pure logic: graph traversal, branch-context building,
    persistence (`db.ts`), provider implementations
  - `types/` — Zod schemas and inferred types
- `src-tauri/` — Rust backend: Tauri commands, plugin registration,
  SQL migrations, window configuration
- `docs/` — this file

## Decisions

- Package manager: npm. Already installed with Node, zero setup cost.
- Renamed the `create-tauri-app` default `tauri-app` placeholder identity
  to `nodus` across `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/src/main.rs`, and `src-tauri/tauri.conf.json`. Bundle
  identifier: `com.nodus.app`.
- `window.confirm`/`alert`/`prompt` do not work in Tauri's webview by
  default — use `@tauri-apps/plugin-dialog` for any confirmation UI.
