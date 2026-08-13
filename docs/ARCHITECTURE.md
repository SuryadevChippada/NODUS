# NODUS Architecture

## Status

Pre-alpha. Implemented so far: the Tauri + React + TypeScript shell, the
interactive node graph canvas, SQLite persistence, node creation /
branching / editing / deletion, a pure ancestor-chain context builder, a
deterministic mock AI provider, real streaming generation via Ollama with
automatic mock-provider fallback, local user identities (name, prompt
symbol, preferred model, response style) with a per-node snapshot that
survives editing or deleting the identity later, and user-controlled
long-term memory (global or per-identity facts that genuinely reach every
matching Ollama generation as context). See [ROADMAP.md](../ROADMAP.md)
for what's next.

## Stack (verified working versions, 2026-08-11, macOS / Apple Silicon)

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
- `tauri-plugin-http` / `@tauri-apps/plugin-http` — outbound HTTP to
  Ollama's local API (raw browser `fetch()` gets 403'd by Ollama for
  carrying a foreign `Origin` header; this plugin's Rust-backed fetch
  sends none). Capability scoped to `http://127.0.0.1:11434/*` only.
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
  nullable), `identity_name`/`identity_symbol` (nullable, see below),
  timestamps
- `edges` — `id`, `session_id`, `source_node_id`, `target_node_id`,
  `created_at`
- `identities` — `id`, `workspace_id`, `name`, `symbol`,
  `preferred_model` (nullable), `response_style` (nullable), timestamps.
  A workspace always has at least one (`ensureDefaultIdentity` creates
  "Default" / "❯" on first access if none exist) — enforced at the store
  layer (`deleteIdentity` refuses below 2 remaining), not by a DB
  constraint.
- `memories` — `id`, `workspace_id`, `identity_id` (nullable), `content`,
  timestamps. User-authored long-term facts, never auto-generated (see
  below). `identity_id` is a genuine live reference (see below), not a
  snapshot.

SQLite's `ON DELETE CASCADE` is declared on the foreign keys for
documentation but **not enforced** — this Tauri SQL plugin version
exposes no way to turn on `PRAGMA foreign_keys` per connection. Any code
path that deletes a node must explicitly delete its edges too; two such
paths already exist in `src/store/graphStore.ts`
(`deleteNodeWithDescendants`, `deleteNodeAndReparentChildren`). A third
explicit-cleanup path exists for `deleteIdentity`: it reassigns that
identity's memories to global scope (`identity_id = NULL`) via
`db.reassignMemoriesToGlobal`, rather than leaving them silently orphaned
on a since-deleted identity. All three are the reference implementation
for this constraint — any future code path that deletes a workspace,
identity, or node must audit what else references it and clean up
explicitly, since the DB will not do it automatically.

Two different relationship shapes exist between `nodes`/`memories` and
`identities`, deliberately:

- `nodes.identity_name`/`identity_symbol` are a **snapshot, not a live
  reference** — no foreign key from `nodes` to `identities`, and never
  should be. Set once at node-creation time; editing or deleting that
  identity afterward must never change how an already-created node
  renders. (ROADMAP.md's phase description also mentions a prompt
  "template" alongside "symbol" — no more specific spec text exists for
  that beyond the symbol/model/style fields actually built; a literal
  per-identity prompt template, if wanted, is unbuilt scope for a later
  pass, not a bug in this one.)
- `memories.identity_id` is the opposite on purpose — a **genuine live
  reference**. A memory scoped to an identity keeps applying as long as
  that identity exists; deleting the identity reassigns the memory to
  global scope rather than destroying it. Any UI that lets a memory's
  scope be edited must re-validate the target identity still exists at
  submit time, not just that a value was selected — a stale in-memory
  form draft referencing an identity deleted elsewhere is a real failure
  mode here (caught in Phase 8's final review), not a hypothetical one.

## Memory and generation

Every generation computes "active memories" — global memories
(`identity_id IS NULL`) plus the current identity's own — and sends their
full content to Ollama as a "remember the following" block prepended to
the transcript (`src/lib/providers/ollamaProvider.ts`'s `buildTranscript`,
before the `responseStyle` line). No summarization, embedding, or
relevance ranking: every active memory goes in full, every time.

**No automatic capture, by design and by construction**: the only
production code paths that ever create or edit a memory are the memory
panel's explicit form-submit handlers (`src/components/MemoryPanel.tsx`).
Nothing in the generation pipeline, node storage, or provider code writes
to memory — it is strictly read-only there. This is the phase's core
privacy constraint, and it is also the app's only defense against
persistent prompt injection: memory content is sent to Ollama verbatim
and unsandboxed, same as `responseStyle` already is, which is a
non-issue only because both are exclusively user-authored in a
local-first, single-user app with no import/sync/sharing channel. If a
future phase ever adds any form of automatic memory capture from
conversation content, this stops being a non-issue.

## AI provider architecture

`src/types/provider.ts` defines the adapter shape every provider
implements: `generate(context, { onToken, signal, model?, responseStyle? }) => Promise<ProviderResponse>`,
where a `ProviderResponse` is Zod-validated (`title`, `answer`,
3–5 `suggestedBranches`, optional `summary`). Only `answer` and
`suggestedBranches` are persisted to SQLite today — `title`/`summary`
have no UI consumer yet, so they aren't given a database column.

Two implementations exist:

- `src/lib/providers/mockProvider.ts` — fully offline and deterministic,
  ignores `model`/`responseStyle`. Used to build and test the whole
  generation pipeline (streaming, cancellation, structured suggestions)
  independent of any real model, and as the automatic fallback whenever
  Ollama is unavailable.
- `src/lib/providers/ollamaProvider.ts` — real streaming generation
  against a local Ollama instance (`checkOllamaHealth`/`listOllamaModels`
  in `ollamaClient.ts`). Picks `model` when it's set and currently
  installed, otherwise the first installed model; prepends
  `responseStyle` as a directive line to the transcript when set.
  `graphStore.ts`'s `generateResponse` checks Ollama's health first and
  falls back to the mock provider — on genuine failure, not on user
  cancellation — with `lastGenerationProvider` tracking which one
  actually ran.

`parseProviderResponse` validates a provider's raw output and performs
one safe repair (keep a real answer, replace only malformed branch
metadata) before falling back to local canned branches — this repair
path is genuinely exercised by Ollama in practice, not just in tests:
`format: "json"` doesn't reliably produce schema-valid output from every
local model.

Cancellation uses the native `AbortController`/`AbortSignal` — no
cancellation-token library. The store's own controller state
(`abortController.signal.aborted`), not the shape of whatever error a
provider throws, is what distinguishes "user cancelled" from "provider
genuinely failed" — `@tauri-apps/plugin-http` doesn't reject with a
`DOMException` on a real in-flight abort the way test mocks do, so
matching on error identity/type is not reliable across providers.
Streaming persistence is debounced (never one database write per token)
with an immediate flush on completion or cancellation.

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
