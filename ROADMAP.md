# Roadmap

NODUS is pre-alpha. This roadmap describes intended direction, not
commitments or dates. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for verified current status.

## Phase 0 — Foundation (done)

Blank Tauri + React + TypeScript application, scaffolded and verified
running locally.

## Phase 1 — Graph canvas

Interactive node/edge canvas with deterministic sample data: drag, zoom,
connect, and manipulate nodes.

## Phase 2 — Local persistence

SQLite-backed workspace storage via the Tauri SQL plugin. Data and node
positions survive an application restart.

## Phase 3 — Conversation flow

Deterministic mock model provider, prompt/response nodes, branching
follow-up choices, and branch-context construction, with tests.

## Phase 4 — Local model provider

Real streaming generation via Ollama, including model listing and
cancellation.

## Beyond Phase 4

Additional model providers (OpenAI-compatible local servers, OpenAI
cloud, Anthropic cloud, managed llama.cpp), identities, themes and fonts,
and the private local activity view are planned but not yet scheduled
into phases.

## Out of scope for now

- Cloud accounts or a hosted NODUS service
- Telemetry or analytics of any kind
- Mobile platforms
