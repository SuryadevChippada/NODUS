# NODUS

**Local intelligence, mapped.**

NODUS is a local-first desktop app for thinking with AI as a map, not a
transcript. Instead of one long chat, each question and answer is a node
on a canvas. Branch from any point, keep every alternative path visible
side by side, and see how an idea actually grew instead of scrolling to
find it.

> **Status: pre-alpha.** APIs, data formats, and the UI are all expected
> to change without notice. There's no packaged release yet — running
> NODUS today means building it from source. See [ROADMAP.md](ROADMAP.md)
> for what's built and what's next.

## Who it's for

Anyone who thinks better visually than linearly — researchers exploring
a problem from multiple angles, developers spiking out an approach,
writers branching a draft, or anyone who's lost a good tangent scrolling
back through a normal chat interface.

## Key features

Implemented so far:

- **Visual conversation graph** — drag, zoom, and pan an unbounded canvas
  of connected nodes ([@xyflow/react](https://reactflow.dev)).
- **Branching** — create a child node from any node; every branch stays
  visible, nothing is silently replaced.
- **Node editing** — create, inline-edit, copy, and delete nodes, with a
  choice on delete between removing a whole branch or keeping its
  children (reconnected to their grandparent).
- **Local persistence** — every workspace is a SQLite database on your
  machine (via the [Tauri SQL plugin](https://v2.tauri.app/plugin/sql/)).
  Nothing leaves your computer, and nothing survives only in memory.
- **Deterministic mock AI provider** — streamed, cancellable generation
  with structured suggested follow-ups, so the whole interaction model
  works end to end before any real model is wired in.

Planned, not yet built (see [ROADMAP.md](ROADMAP.md) for the full list
and current order): local model support via Ollama, cloud providers
(OpenAI, Anthropic) with OS-credential-store key storage, local
identities, long-term user-controlled memory, a Kanagawa-based theme
system, and a private local activity view.

## Quick start

There's no installer yet — build from source:

```bash
git clone https://github.com/SuryadevChippada/NODUS.git
cd NODUS
npm install
npm run tauri dev
```

This opens NODUS as a native desktop window. The first launch seeds a
small demo graph into a local SQLite database and reloads it on every
later launch.

### Prerequisites

- [Node.js](https://nodejs.org) and npm
- [Rust](https://rustup.rs) (stable toolchain)
- Your platform's Tauri build tools — see the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

Verified so far on macOS (Apple Silicon). Other platforms aren't tested
yet — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for exact
verified versions.

## Development

```bash
npm run dev            # Vite dev server only (frontend, no Tauri window)
npm run tauri dev      # full app with hot reload
npm run test             # Vitest unit/component tests
npm run lint              # ESLint
npm run format:check     # Prettier check
npm run build             # frontend production build (tsc + vite build)
```

Rust-side checks, run from `src-tauri/`:

```bash
cargo check
cargo fmt --check
cargo clippy
```

## Building the app

A full packaged build (`npm run tauri build`) produces a platform-native
bundle, but NODUS is pre-alpha and this hasn't been set up with
distribution/signing yet — for now, `npm run tauri dev` is the supported
way to run it. See [ROADMAP.md](ROADMAP.md)'s packaging phase.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for
the development workflow, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
for how we expect people to treat each other here. For anything beyond a
small fix, please open an issue or discussion first.

Other useful docs:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — verified stack, current
  status, and design decisions
- [SECURITY.md](SECURITY.md) — how to report a vulnerability
- [SUPPORT.md](SUPPORT.md) — where to ask questions vs. file a bug

## License

MIT — see [LICENSE](LICENSE).
