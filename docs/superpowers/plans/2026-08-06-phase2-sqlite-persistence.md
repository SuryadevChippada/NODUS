# Phase 2: SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory-only, hardcoded-sample-data graph store from Phase 1 with a SQLite-backed one. On first launch, a default workspace and session are created and seeded with the Phase 1 sample graph; on every subsequent launch, the previously saved nodes, edges, and node positions are loaded from disk. Node/edge creation, deletion, and position changes persist to SQLite as they happen (position writes debounced, not one write per drag frame).

**Architecture:** `tauri-plugin-sql` (Rust) + `@tauri-apps/plugin-sql` (JS) provide the SQLite connection via Tauri's IPC bridge. Rust registers four migrated tables (`workspaces`, `sessions`, `nodes`, `edges`) at startup. A thin frontend module (`src/lib/db.ts`) wraps the plugin's raw `execute`/`select` calls in typed, parameterized functions specific to this app's schema — nothing calls the plugin directly outside that file. `useGraphStore` (from Phase 1) gains a `hydrate()` action that loads persisted state on mount, and its existing change handlers now also write through to `db.ts`.

**Tech Stack:** `tauri-plugin-sql@2.4.0` (Rust, `sqlite` feature), `@tauri-apps/plugin-sql` (JS, same version line). Everything else is the stack already in place from Phase 0/1 (Tauri 2, React 19, strict TypeScript, Zustand, Zod, Vitest).

## Global Constraints

- Strict TypeScript throughout — no `any`, no suppressed type errors.
- All SQL is parameterized (`$1`, `$2`, ... placeholders with a `values` array) — never string-interpolate a value into a query.
- No new dependency beyond `tauri-plugin-sql`/`@tauri-apps/plugin-sql` — no ORM, no query builder, no second database library.
- **Verified plugin API** (checked directly against the installed `tauri-plugin-sql@2.4.0` source in `~/.cargo/registry/src/.../tauri-plugin-sql-2.4.0/src/{lib.rs,commands.rs}` and the installed `@tauri-apps/plugin-sql` `.d.ts`, not assumed):
  - Rust: `tauri_plugin_sql::Builder::new().add_migrations(db_url, vec![Migration { version, description, sql, kind: MigrationKind::Up }]).build()`, registered via `.plugin(...)` in `lib.rs`.
  - Migrations run automatically the first time JS calls `Database.load(db_url)` — no `preload` config needed, confirmed by reading `commands::load` in the plugin source.
  - JS: `import Database from "@tauri-apps/plugin-sql"`, `const db = await Database.load("sqlite:nodus.db")`, `db.execute(sql, values)` for writes, `db.select(sql, values)` for reads. `sqlite:` prefix is required; the path is relative to the app data directory.
  - **Permissions gotcha, already verified:** the plugin's `default` permission set (`permissions/default.toml`) grants only `allow-close`, `allow-load`, `allow-select` — **`execute` is NOT included by default.** `src-tauri/capabilities/default.json` must list both `"sql:default"` AND `"sql:allow-execute"`, or every INSERT/UPDATE/DELETE fails at runtime with a permission error despite compiling fine.
- **Foreign keys are declared but not enforced.** SQLite disables FK constraint enforcement per-connection by default, and this plugin version exposes no hook to send `PRAGMA foreign_keys = ON` per connection. `REFERENCES`/`ON DELETE CASCADE` clauses in the schema below are for documentation and future-proofing only — do not rely on cascading deletes actually happening at the SQLite level in this phase. This phase has no delete-session/delete-workspace UI, so it's not yet a functional gap; the next phase that adds deletion must handle cleanup explicitly in application code (e.g., delete nodes/edges before deleting a session) rather than assuming the database will do it.
- IDs are UUIDs generated client-side via the native `crypto.randomUUID()` (available in the Tauri webview, zero new dependency) — not a Rust ID-generation crate.
- No speculative tables: only `workspaces`, `sessions`, `nodes`, `edges` in this phase. `identities`, `memories`, `model_profiles`, `generation_runs`, `activity_events`, `daily_activity`, `focus_sessions`, `app_settings` belong to their own later phases — do not create them now.
- Do not commit or push to `main` — this plan's tasks commit on the `phase2-persistence` branch inside the worktree at `.worktrees/phase2-persistence`. Merging back is a separate, explicit step at the end.
- Every task must leave `npm run build`, `npm run lint`, `npm run test`, `npm run format:check`, and `cargo check` (run from `src-tauri/`) passing before it is considered done.

---

## File Structure

- Modify `src-tauri/Cargo.toml` — add `tauri-plugin-sql` dependency.
- Modify `src-tauri/src/lib.rs` — register the plugin with migrations.
- Modify `src-tauri/capabilities/default.json` — add `sql:default` and `sql:allow-execute` permissions.
- Modify `package.json` — add `@tauri-apps/plugin-sql` dependency.
- Create `src/lib/db.ts` — typed persistence layer wrapping the SQL plugin.
- Create `src/lib/db.test.ts` — unit tests using a mocked `@tauri-apps/plugin-sql` module.
- Modify `src/store/graphStore.ts` — add `hydrate()` action; wire change handlers to persist.
- Modify `src/store/graphStore.test.ts` — extend tests to cover persistence wiring, still using the DB mock.
- Modify `src/App.tsx` — call `hydrate()` on mount, show a minimal loading state while it resolves.

---

### Task 1: Register the SQL plugin and migrations

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: a Tauri app that, when its frontend calls `Database.load("sqlite:nodus.db")`, creates (if absent) `~/Library/Application Support/com.nodus.app/nodus.db` (macOS path; the plugin resolves the actual per-OS app-data directory itself) with four tables per the migration SQL below. Task 2 depends on this being registered correctly.

- [ ] **Step 1: Add the Rust dependency**

```bash
cd src-tauri
cargo add tauri-plugin-sql --features sqlite
```

Confirm it resolves to `2.4.0` (or later — if a newer version installs, verify `Builder`/`Migration`/`MigrationKind` still have the shape used in Step 3 below by checking `~/.cargo/registry/src/*/tauri-plugin-sql-<version>/src/lib.rs` before proceeding; note any drift in your task report).

- [ ] **Step 2: Add the JS dependency**

```bash
cd ..
npm install @tauri-apps/plugin-sql
```

- [ ] **Step 3: Register the plugin with migrations**

In `src-tauri/src/lib.rs`, add the migration definitions and register the plugin. The file currently looks like this (verify against the actual current file — Phase 1 may have changed line numbers, but the content should match):

```rust
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Replace it with:

```rust
use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const DB_URL: &str = "sqlite:nodus.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create workspaces, sessions, nodes, edges",
        sql: r#"
            CREATE TABLE workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);

            CREATE TABLE nodes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                text TEXT NOT NULL,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX idx_nodes_session_id ON nodes(session_id);

            CREATE TABLE edges (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE INDEX idx_edges_session_id ON edges(session_id);
        "#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Add SQL permissions to capabilities**

Read the current `src-tauri/capabilities/default.json` first — it should currently list `"core:default"` and `"opener:default"` in its `permissions` array from Phase 0's scaffold. Add both `"sql:default"` and `"sql:allow-execute"` to that same array (do not remove the existing two):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "sql:default",
    "sql:allow-execute"
  ]
}
```

- [ ] **Step 5: Verify it compiles and the frontend build still passes**

```bash
cd src-tauri && cargo check && cd ..
npm run build
npm run lint
npm run test
npm run format:check
```

Expected: all pass. (No frontend code calls `Database.load()` yet, so there's nothing to manually run yet — that's proven in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "Register tauri-plugin-sql with workspaces/sessions/nodes/edges migration"
```

---

### Task 2: Typed persistence layer (`src/lib/db.ts`)

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: nothing from earlier frontend tasks (Task 1 is Rust/config only). Uses `GraphNode`/`GraphEdge`/`GraphNodeData` types from `src/types/graph.ts` (Phase 1).
- Produces (all async, all parameterized SQL under the hood):
  - `getDb(): Promise<Database>` — memoized singleton, calls `Database.load("sqlite:nodus.db")` once.
  - `ensureDefaultWorkspaceAndSession(): Promise<{ workspaceId: string; sessionId: string; isNewSession: boolean }>` — selects the first workspace/session if any exist; if none exist, creates one of each with `crypto.randomUUID()` ids and returns `isNewSession: true`.
  - `loadSessionGraph(sessionId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>` — selects all nodes/edges for a session, mapped back into the `GraphNode`/`GraphEdge` shape (`position: { x: position_x, y: position_y }`, `data: { text }`).
  - `insertNode(sessionId: string, node: GraphNode): Promise<void>`
  - `updateNodePosition(nodeId: string, position: { x: number; y: number }): Promise<void>`
  - `deleteNode(nodeId: string): Promise<void>`
  - `insertEdge(sessionId: string, edge: GraphEdge): Promise<void>`
  - `deleteEdge(edgeId: string): Promise<void>`

  Task 3 (store) is the only consumer of these functions.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/db.test.ts`. This mocks `@tauri-apps/plugin-sql`'s default export entirely — no real Tauri runtime needed:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockSelect = vi.fn().mockResolvedValue([]);
const mockLoad = vi.fn().mockResolvedValue({
  execute: mockExecute,
  select: mockSelect,
});

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: mockLoad },
}));

import {
  ensureDefaultWorkspaceAndSession,
  loadSessionGraph,
  insertNode,
  updateNodePosition,
  deleteNode,
  insertEdge,
  deleteEdge,
} from "./db";

beforeEach(() => {
  mockExecute.mockClear();
  mockSelect.mockClear();
  mockLoad.mockClear();
  mockSelect.mockResolvedValue([]);
});

describe("ensureDefaultWorkspaceAndSession", () => {
  it("creates a workspace and session when none exist", async () => {
    mockSelect.mockResolvedValueOnce([]); // no existing session found
    const result = await ensureDefaultWorkspaceAndSession();
    expect(result.isNewSession).toBe(true);
    expect(result.workspaceId).toEqual(expect.any(String));
    expect(result.sessionId).toEqual(expect.any(String));
    // one INSERT for the workspace, one for the session
    const insertCalls = mockExecute.mock.calls.filter((c) =>
      String(c[0]).trim().toUpperCase().startsWith("INSERT"),
    );
    expect(insertCalls.length).toBe(2);
  });

  it("returns the existing session when one is found, without inserting", async () => {
    mockSelect.mockResolvedValueOnce([
      { id: "session-1", workspace_id: "workspace-1" },
    ]);
    const result = await ensureDefaultWorkspaceAndSession();
    expect(result).toEqual({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      isNewSession: false,
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("loadSessionGraph", () => {
  it("maps rows back into GraphNode/GraphEdge shape", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "prompt",
          text: "hello",
          position_x: 10,
          position_y: 20,
        },
      ])
      .mockResolvedValueOnce([
        { id: "e1", source_node_id: "n1", target_node_id: "n2" },
      ]);
    const { nodes, edges } = await loadSessionGraph("session-1");
    expect(nodes).toEqual([
      {
        id: "n1",
        type: "prompt",
        position: { x: 10, y: 20 },
        data: { text: "hello" },
      },
    ]);
    expect(edges).toEqual([{ id: "e1", source: "n1", target: "n2" }]);
  });
});

describe("write operations use parameterized SQL", () => {
  it("insertNode passes values as bind params, not string-interpolated", async () => {
    await insertNode("session-1", {
      id: "n1",
      type: "prompt",
      position: { x: 1, y: 2 },
      data: { text: "hi" },
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql).not.toContain("hi");
    expect(values).toContain("hi");
  });

  it("updateNodePosition updates only position columns for the given id", async () => {
    await updateNodePosition("n1", { x: 5, y: 6 });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(values).toEqual(expect.arrayContaining([5, 6, "n1"]));
  });

  it("deleteNode deletes by id", async () => {
    await deleteNode("n1");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["n1"]);
  });

  it("insertEdge and deleteEdge issue parameterized statements", async () => {
    await insertEdge("session-1", { id: "e1", source: "n1", target: "n2" });
    expect(mockExecute.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["e1", "session-1", "n1", "n2"]),
    );

    await deleteEdge("e1");
    const [sql, values] = mockExecute.mock.calls[1];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["e1"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- db.test
```

Expected: FAIL — `src/lib/db.ts` doesn't exist yet.

- [ ] **Step 3: Implement `src/lib/db.ts`**

```ts
import Database from "@tauri-apps/plugin-sql";
import type { GraphNode, GraphEdge } from "../types/graph";

const DB_URL = "sqlite:nodus.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export async function ensureDefaultWorkspaceAndSession(): Promise<{
  workspaceId: string;
  sessionId: string;
  isNewSession: boolean;
}> {
  const db = await getDb();
  const existing = await db.select<{ id: string; workspace_id: string }[]>(
    "SELECT id, workspace_id FROM sessions ORDER BY created_at ASC LIMIT 1",
    [],
  );

  if (existing.length > 0) {
    return {
      workspaceId: existing[0].workspace_id,
      sessionId: existing[0].id,
      isNewSession: false,
    };
  }

  const workspaceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    [workspaceId, "Default Workspace", now, now],
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [sessionId, workspaceId, "Welcome", now, now],
  );

  return { workspaceId, sessionId, isNewSession: true };
}

export async function loadSessionGraph(
  sessionId: string,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const db = await getDb();

  const nodeRows = await db.select<
    {
      id: string;
      type: string;
      text: string;
      position_x: number;
      position_y: number;
    }[]
  >(
    "SELECT id, type, text, position_x, position_y FROM nodes WHERE session_id = $1",
    [sessionId],
  );
  const edgeRows = await db.select<
    { id: string; source_node_id: string; target_node_id: string }[]
  >("SELECT id, source_node_id, target_node_id FROM edges WHERE session_id = $1", [
    sessionId,
  ]);

  const nodes: GraphNode[] = nodeRows.map((row) => ({
    id: row.id,
    type: row.type as "prompt" | "response",
    position: { x: row.position_x, y: row.position_y },
    data: { text: row.text },
  }));
  const edges: GraphEdge[] = edgeRows.map((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
  }));

  return { nodes, edges };
}

export async function insertNode(
  sessionId: string,
  node: GraphNode,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO nodes (id, session_id, type, text, position_x, position_y, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      node.id,
      sessionId,
      node.type,
      node.data.text,
      node.position.x,
      node.position.y,
      now,
      now,
    ],
  );
}

export async function updateNodePosition(
  nodeId: string,
  position: { x: number; y: number },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE nodes SET position_x = $1, position_y = $2, updated_at = $3 WHERE id = $4",
    [position.x, position.y, now, nodeId],
  );
}

export async function deleteNode(nodeId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM nodes WHERE id = $1", [nodeId]);
}

export async function insertEdge(
  sessionId: string,
  edge: GraphEdge,
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO edges (id, session_id, source_node_id, target_node_id, created_at) VALUES ($1, $2, $3, $4, $5)",
    [edge.id, sessionId, edge.source, edge.target, now],
  );
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM edges WHERE id = $1", [edgeId]);
}
```

If `db.select<T>(...)`'s generic type parameter doesn't match the installed `@tauri-apps/plugin-sql` version's actual signature, check its `.d.ts` (`node_modules/@tauri-apps/plugin-sql/dist/*.d.ts`) and adjust — the brief's code was written against the version installed during planning, not compiled yet.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- db.test
npm run build
```

Expected: all `db.test.ts` cases pass; `npm run build` (tsc) passes with zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add typed SQLite persistence layer for workspaces, sessions, nodes, edges"
```

---

### Task 3: Wire persistence into the graph store

**Files:**
- Modify: `src/store/graphStore.ts`
- Modify: `src/store/graphStore.test.ts`

**Interfaces:**
- Consumes: `ensureDefaultWorkspaceAndSession`, `loadSessionGraph`, `insertNode`, `updateNodePosition`, `deleteNode`, `insertEdge`, `deleteEdge` from `src/lib/db.ts` (Task 2). `sampleNodes`/`sampleEdges` from `src/lib/sampleGraph.ts` (Phase 1, used only to seed a brand-new session).
- Produces: `useGraphStore` gains `sessionId: string | null` and `hydrate(): Promise<void>` on top of its existing Phase 1 shape (`nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `onConnect`). Task 4 calls `hydrate()` once, from `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Add to `src/store/graphStore.test.ts` (append — do not remove Phase 1's existing tests in this file, they still apply to the change-handler logic):

```ts
vi.mock("../lib/db", () => ({
  ensureDefaultWorkspaceAndSession: vi.fn(),
  loadSessionGraph: vi.fn(),
  insertNode: vi.fn().mockResolvedValue(undefined),
  updateNodePosition: vi.fn().mockResolvedValue(undefined),
  deleteNode: vi.fn().mockResolvedValue(undefined),
  insertEdge: vi.fn().mockResolvedValue(undefined),
  deleteEdge: vi.fn().mockResolvedValue(undefined),
}));

import * as db from "../lib/db";

describe("useGraphStore hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState(useGraphStore.getInitialState());
  });

  it("seeds the sample graph into the database on a brand-new session", async () => {
    vi.mocked(db.ensureDefaultWorkspaceAndSession).mockResolvedValue({
      workspaceId: "w1",
      sessionId: "s1",
      isNewSession: true,
    });
    vi.mocked(db.loadSessionGraph).mockResolvedValue({ nodes: [], edges: [] });

    await useGraphStore.getState().hydrate();

    expect(useGraphStore.getState().sessionId).toBe("s1");
    expect(useGraphStore.getState().nodes.length).toBeGreaterThan(0);
    expect(vi.mocked(db.insertNode)).toHaveBeenCalled();
    expect(vi.mocked(db.insertEdge)).toHaveBeenCalled();
  });

  it("loads existing persisted nodes/edges without reseeding on a returning session", async () => {
    vi.mocked(db.ensureDefaultWorkspaceAndSession).mockResolvedValue({
      workspaceId: "w1",
      sessionId: "s1",
      isNewSession: false,
    });
    const persisted = {
      nodes: [
        {
          id: "n1",
          type: "prompt" as const,
          position: { x: 1, y: 2 },
          data: { text: "saved" },
        },
      ],
      edges: [],
    };
    vi.mocked(db.loadSessionGraph).mockResolvedValue(persisted);

    await useGraphStore.getState().hydrate();

    expect(useGraphStore.getState().nodes).toEqual(persisted.nodes);
    expect(vi.mocked(db.insertNode)).not.toHaveBeenCalled();
  });
});

describe("useGraphStore persistence side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState({
      sessionId: "s1",
      nodes: [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: { text: "A" } },
      ],
      edges: [],
    });
  });

  it("persists a node removal immediately", () => {
    useGraphStore.getState().onNodesChange([{ id: "a", type: "remove" }]);
    expect(vi.mocked(db.deleteNode)).toHaveBeenCalledWith("a");
  });

  it("persists an edge addition on connect", () => {
    useGraphStore.setState({
      nodes: [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: { text: "A" } },
        { id: "b", type: "response", position: { x: 0, y: 100 }, data: { text: "B" } },
      ],
    });
    useGraphStore
      .getState()
      .onConnect({ source: "a", target: "b", sourceHandle: null, targetHandle: null });
    expect(vi.mocked(db.insertEdge)).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ source: "a", target: "b" }),
    );
  });

  it("persists an edge removal immediately", () => {
    useGraphStore.setState({ edges: [{ id: "e1", source: "a", target: "b" }] });
    useGraphStore.getState().onEdgesChange([{ id: "e1", type: "remove" }]);
    expect(vi.mocked(db.deleteEdge)).toHaveBeenCalledWith("e1");
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

```bash
npm run test -- graphStore
```

Expected: the hydration/persistence tests FAIL (`hydrate` doesn't exist, `db` isn't imported yet); the Phase 1 change-handler tests still PASS unchanged.

- [ ] **Step 3: Implement the store changes**

Replace `src/store/graphStore.ts` with (this keeps every Phase 1 field/behavior, adding `sessionId` and `hydrate`, and adding persistence calls inside the existing handlers):

```ts
import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import { sampleNodes, sampleEdges } from "../lib/sampleGraph";
import type { GraphNodeData } from "../types/graph";
import * as db from "../lib/db";

const POSITION_SAVE_DEBOUNCE_MS = 400;
const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface GraphState {
  sessionId: string | null;
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  hydrate: () => Promise<void>;
  onNodesChange: (changes: NodeChange<Node<GraphNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  sessionId: null,
  nodes: sampleNodes,
  edges: sampleEdges,

  hydrate: async () => {
    const { sessionId, isNewSession } = await db.ensureDefaultWorkspaceAndSession();

    if (isNewSession) {
      for (const node of sampleNodes) {
        await db.insertNode(sessionId, node);
      }
      for (const edge of sampleEdges) {
        await db.insertEdge(sessionId, edge);
      }
      set({ sessionId, nodes: sampleNodes, edges: sampleEdges });
      return;
    }

    const { nodes, edges } = await db.loadSessionGraph(sessionId);
    set({ sessionId, nodes, edges });
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });

    const sessionId = get().sessionId;
    if (!sessionId) return;

    for (const change of changes) {
      if (change.type === "remove") {
        db.deleteNode(change.id);
        const timer = positionSaveTimers.get(change.id);
        if (timer) {
          clearTimeout(timer);
          positionSaveTimers.delete(change.id);
        }
      } else if (change.type === "position" && change.position) {
        const existing = positionSaveTimers.get(change.id);
        if (existing) clearTimeout(existing);
        const { id, position } = change;
        positionSaveTimers.set(
          id,
          setTimeout(() => {
            db.updateNodePosition(id, position);
            positionSaveTimers.delete(id);
          }, POSITION_SAVE_DEBOUNCE_MS),
        );
      }
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });

    for (const change of changes) {
      if (change.type === "remove") {
        db.deleteEdge(change.id);
      }
    }
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });

    const sessionId = get().sessionId;
    if (!sessionId) return;
    const newEdge = get().edges[get().edges.length - 1];
    db.insertEdge(sessionId, {
      id: newEdge.id,
      source: newEdge.source,
      target: newEdge.target,
    });
  },
}));
```

Note the debounce is a simple per-node `setTimeout` map, not a new dependency — this satisfies the spec's "debounce position writes" requirement without adding a debounce library.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- graphStore
npm run build
npm run lint
```

Expected: all tests in `graphStore.test.ts` pass (both the Phase 1 change-handler tests and the new hydration/persistence tests); `npm run build` and `npm run lint` succeed.

- [ ] **Step 5: Commit**

```bash
git add src/store/graphStore.ts src/store/graphStore.test.ts
git commit -m "Wire graph store to SQLite: hydrate on load, persist changes as they happen"
```

---

### Task 4: Hydrate on app start and verify persistence survives restart

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useGraphStore` (Task 3).
- Produces: nothing further downstream — this is the last task in this plan.

- [ ] **Step 1: Wire `hydrate()` into `App.tsx`**

Replace `src/App.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./components/GraphCanvas";
import { useGraphStore } from "./store/graphStore";

function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const hydrate = useGraphStore((state) => state.hydrate);

  useEffect(() => {
    hydrate().then(() => setIsHydrated(true));
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-sm text-amber-50">
        <p>❯ loading workspace…</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}

export default App;
```

- [ ] **Step 2: Verify the build**

```bash
npm run build
npm run lint
npm run test
npm run format:check
cd src-tauri && cargo check && cd ..
```

Expected: all pass.

- [ ] **Step 3: Manual verification that persistence survives an actual restart**

This is the core proof of this phase's goal and cannot be automated (it requires two separate process launches with the OS actually keeping the SQLite file on disk between them). If your sandbox has no display access, run the compile/process-alive checks below and say plainly that you could not visually confirm — do not claim the drag-and-restart behavior worked without actually having watched it happen (this exact situation came up in Phase 1; be honest the same way here).

```bash
npm run tauri dev
```

1. Confirm the five Phase 1 sample nodes render (first launch: they get seeded into SQLite by `hydrate()`).
2. Drag one node to a visibly different position.
3. Wait at least 1 second (past the 400ms debounce) for the position write to land.
4. Fully quit the app (not just close the window — stop the `tauri dev` process).
5. Run `npm run tauri dev` again.
6. Confirm the node you dragged opens in its new position, not the original sample position.

Report exactly what you observed at each numbered step.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Hydrate graph store from SQLite on app start"
```

---

## Definition of Done

- [ ] `npm run build`, `npm run lint`, `npm run test`, `npm run format:check`, and `cargo check` (from `src-tauri/`) all pass with zero errors.
- [ ] A fresh launch creates a default workspace/session, seeds it with the Phase 1 sample graph, and persists that seed to SQLite.
- [ ] Dragging a node to a new position, then fully restarting the app, shows that node in its new position — verified by an actual two-launch manual test, not assumed.
- [ ] No table beyond `workspaces`, `sessions`, `nodes`, `edges` was created in this phase.
- [ ] `sql:allow-execute` is present in capabilities (without it, writes silently fail at the permission layer, not the SQL layer — this is exactly the kind of failure that looks like a bug elsewhere if missed).
