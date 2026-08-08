# Roadmap

NODUS is pre-alpha. This roadmap describes intended direction, not
commitments or dates. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for verified current status.

## Foundation (done)

Tauri + React + TypeScript shell, and the interactive graph canvas
(drag, zoom, pan, minimap) with deterministic sample data.

## 1. Persistence (done)

SQLite via the Tauri SQL plugin. Workspace, session, node, and edge
data — including positions — survive an application restart.

## 2. Conversation flow (done)

Create, branch, inline-edit, copy, and delete nodes, with a choice
between cascading a branch on delete or reparenting its children.

## 3. Branch-specific context (done)

A pure, tested function building a node's AI context from its ancestor
chain to the root, in chronological order, with sibling branches
excluded.

## 4. Mock provider (done)

A deterministic, fully offline AI provider: streamed generation,
genuine mid-stream cancellation, structured suggested-branch responses
with schema validation and safe fallback repair, and
click-to-branch-and-generate chaining. Establishes the typed provider
interface every real provider implements next.

## 5. Local provider

Real streaming generation via [Ollama](https://ollama.com) over its
local loopback API: health checking, model listing, cancellation, and
`parseProviderResponse`'s repair path actually exercised against real
(occasionally malformed) model output.

## 6. Identity

Local user identities: prompt symbol/template, preferred model and
response style, historical nodes preserve the identity snapshot active
when they were created.

## 7. Memory

User-controlled long-term memory: explicit save/view/edit/delete, no
automatic capture of sensitive data, scoped by workspace and identity.

## 8. Appearance

Kanagawa as the default theme via semantic tokens, a theme selector,
custom theme creation, and font customization.

## 9. Activity

A private local activity view: calendar, contribution heatmap, streaks,
optional goals, optional focus timer. Meaningful actions only — no
per-token events, no fake historical data.

## 10. Cloud providers

OpenAI and Anthropic APIs with user-supplied keys, stored in the OS
credential store (never in SQLite, logs, or exports), with an explicit
local-vs-cloud indicator.

## 11. Packaging and hardening

Signed, distributable builds; platform testing beyond macOS; a security
and privacy review; documentation kept in sync with actual behavior.

## Out of scope for now

- Cloud accounts or a hosted NODUS service
- Telemetry or analytics of any kind
- Mobile platforms
