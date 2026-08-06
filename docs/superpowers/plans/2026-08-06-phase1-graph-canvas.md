# Phase 1: Graph Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default Tauri+React+TS template screen with an interactive node/edge graph canvas rendering a deterministic sample conversation tree — draggable, zoomable, with visible curved edges and custom node rendering for "prompt" and "response" node types.

**Architecture:** `@xyflow/react` renders the canvas; a Zustand store (`useGraphStore`) owns node/edge state and exposes the change handlers React Flow expects (`onNodesChange`/`onEdgesChange`/`onConnect`), seeded from a hardcoded sample graph validated by Zod schemas. No backend, no AI calls, no persistence — this phase proves the UI shell only. Tailwind CSS styles the canvas and custom nodes toward the spec's dark, terminal-inspired look (not the full user-configurable theme system — that is out of scope here).

**Tech Stack:** React 19, TypeScript (strict, already configured), Vite 7, `@xyflow/react`, Zustand, Zod, Tailwind CSS v4 (`@tailwindcss/vite` plugin), Vitest + `@testing-library/react` + `@testing-library/jest-dom`, ESLint (flat config) + Prettier.

## Global Constraints

- Strict TypeScript throughout — no `any`, no suppressed type errors (from the project's required stack: "strict TypeScript").
- No speculative abstractions: build exactly the sample-data graph canvas this phase needs, not a generic "provider system" or persistence layer — those are later phases.
- No new dependency where the existing stack already solves the problem (ponytail/YAGNI — this repo's engineering rules).
- Default appearance direction from the product spec: dark background, curved (default bezier) edges, dot-grid canvas background, restrained accent colors (cyan for prompts, green for responses) — full user-selectable theming/fonts is explicitly out of scope for this phase.
- Every task must leave `npm run build`, `npm run lint`, and `npm run test` passing before it is considered done.
- **Verified API surface:** `@xyflow/react@12.11.2`'s `Node<NodeData, NodeType>`, `NodeProps<NodeType>`, `applyNodeChanges`, `applyEdgeChanges`, `addEdge`, and `BackgroundVariant` were checked directly against that version's installed type definitions before this plan was written — the signatures used below match. `npm view @xyflow/react version` may resolve a newer version by the time Task 1 runs; if so, re-verify these signatures against whatever version actually installs and note any drift in your task report.
- Do not commit or push to `main` — this plan's tasks commit on the `phase1-graph-canvas` branch inside the worktree at `.worktrees/phase1-graph-canvas`. Merging back is a separate, explicit step at the end.

---

## File Structure

- Create `tailwind.config.js`, `postcss` is not needed (using `@tailwindcss/vite` plugin) — Tailwind wired via `vite.config.ts` + `src/index.css`.
- Create `src/index.css` — Tailwind entrypoint, replaces `src/App.css`.
- Create `eslint.config.js` — flat ESLint config for React + TypeScript.
- Create `.prettierrc.json` — minimal Prettier config.
- Modify `vite.config.ts` — add the Tailwind Vite plugin and a `test` block for Vitest.
- Modify `package.json` — add `lint`, `test`, `format`, `format:check` scripts.
- Create `src/setupTests.ts` — Vitest/RTL setup, including a `ResizeObserver` polyfill `@xyflow/react` needs under jsdom.
- Create `src/types/graph.ts` — Zod schemas + inferred types for graph node/edge data.
- Create `src/lib/sampleGraph.ts` — deterministic sample nodes/edges.
- Create `src/lib/sampleGraph.test.ts` — validates the sample data against the schemas.
- Create `src/store/graphStore.ts` — Zustand store wrapping React Flow's node/edge change handlers.
- Create `src/store/graphStore.test.ts` — pure unit tests for the store's actions.
- Create `src/components/nodes/PromptNode.tsx`, `src/components/nodes/ResponseNode.tsx` — custom node renderers.
- Create `src/components/GraphCanvas.tsx` — the canvas component wiring the store + custom node types into `<ReactFlow>`.
- Create `src/components/GraphCanvas.test.tsx` — renders the canvas, asserts every sample node's text and edge count appear.
- Modify `src/App.tsx` — render `<ReactFlowProvider><GraphCanvas /></ReactFlowProvider>` instead of the default template.
- Modify `src/main.tsx` — import `./index.css` instead of (or alongside removing) `./App.css`.
- Delete `src/App.css`, `src/assets/react.svg` if no longer referenced after `App.tsx` is rewritten.

---

### Task 1: Tooling foundation — Tailwind, Zustand, Zod, @xyflow/react, Vitest, ESLint, Prettier

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/index.css`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `src/setupTests.ts`

**Interfaces:**
- Produces: a working `npm run test` (Vitest, jsdom environment, RTL + jest-dom matchers available globally), a working `npm run lint` (ESLint flat config for `.ts`/`.tsx`), a working `npm run format` / `npm run format:check` (Prettier), Tailwind utility classes available in any `.tsx` file via the existing `vite build`/`vite dev` pipeline. All later tasks depend on these commands working.

- [ ] **Step 1: Install dependencies**

Run from the worktree root:

```bash
npm install @xyflow/react zustand zod
npm install -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/dom eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier
```

Do not pin exact versions by hand — let npm resolve current `latest` for each. After install, run `npm ls @xyflow/react zustand zod tailwindcss vitest` and record the resolved versions in your task report.

- [ ] **Step 2: Wire Tailwind into Vite**

Replace the contents of `vite.config.ts` with (adjust only the `plugins` array if the existing file has extra config beyond the default `create-tauri-app` output — keep everything else from the current file intact):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
  },
}));
```

If the existing `vite.config.ts` differs from this (e.g. different `server` options already present from the scaffold), merge — keep the scaffold's existing values, only add the `tailwindcss()` plugin and the `test` block.

- [ ] **Step 3: Create the Tailwind entrypoint**

Create `src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Create the Vitest setup file**

Create `src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}
```

- [ ] **Step 5: Add ESLint flat config**

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri/target"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
```

- [ ] **Step 6: Add Prettier config**

Create `.prettierrc.json`:

```json
{}
```

- [ ] **Step 7: Add npm scripts**

In `package.json`, add to `"scripts"` (keep the existing `dev`, `build`, `preview`, `tauri` scripts unchanged):

```json
"lint": "eslint .",
"test": "vitest run",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 8: Verify the tooling works**

Run each of these and confirm they succeed (test/lint will have nothing meaningful to check yet — that's expected, just confirm the commands run without configuration errors):

```bash
npm run build
npm run lint
npm run test
npm run format:check
```

`npm run lint` may report pre-existing issues in the scaffold's default `App.tsx`/`main.tsx` — that's fine, Task 4 rewrites `App.tsx`. Do not fix scaffold lint issues in this task.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/index.css src/setupTests.ts eslint.config.js .prettierrc.json
git commit -m "Add Tailwind, Zustand, Zod, @xyflow/react, Vitest, and lint/format tooling"
```

---

### Task 2: Graph data types and deterministic sample data

**Files:**
- Create: `src/types/graph.ts`
- Create: `src/lib/sampleGraph.ts`
- Create: `src/lib/sampleGraph.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `nodeDataSchema`, `graphNodeSchema`, `graphEdgeSchema` (Zod schemas), `GraphNodeData`, `GraphNode`, `GraphEdge` (inferred types) from `src/types/graph.ts`; `sampleNodes: GraphNode[]` and `sampleEdges: GraphEdge[]` from `src/lib/sampleGraph.ts`. Task 3 (store) and Task 4 (canvas) both import these.

- [ ] **Step 1: Write the failing test for schema validation**

Create `src/lib/sampleGraph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sampleNodes, sampleEdges } from "./sampleGraph";
import { graphNodeSchema, graphEdgeSchema } from "../types/graph";

describe("sample graph data", () => {
  it("has at least one prompt node and one response node", () => {
    const types = sampleNodes.map((n) => n.type);
    expect(types).toContain("prompt");
    expect(types).toContain("response");
  });

  it("every node passes the graph node schema", () => {
    for (const node of sampleNodes) {
      expect(() => graphNodeSchema.parse(node)).not.toThrow();
    }
  });

  it("every edge passes the graph edge schema", () => {
    for (const edge of sampleEdges) {
      expect(() => graphEdgeSchema.parse(edge)).not.toThrow();
    }
  });

  it("every edge references node ids that exist", () => {
    const ids = new Set(sampleNodes.map((n) => n.id));
    for (const edge of sampleEdges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("has no duplicate node ids", () => {
    const ids = sampleNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -- sampleGraph
```

Expected: FAIL — `src/types/graph.ts` and `src/lib/sampleGraph.ts` do not exist yet.

- [ ] **Step 3: Create the Zod schemas and types**

Create `src/types/graph.ts`:

```ts
import { z } from "zod";

export const nodeDataSchema = z.object({
  text: z.string().min(1),
});

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["prompt", "response"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: nodeDataSchema,
});

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export type GraphNodeData = z.infer<typeof nodeDataSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
```

- [ ] **Step 4: Create the deterministic sample data**

Create `src/lib/sampleGraph.ts`:

```ts
import type { GraphNode, GraphEdge } from "../types/graph";

export const sampleNodes: GraphNode[] = [
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 0, y: 0 },
    data: { text: "What is the capital of France?" },
  },
  {
    id: "response-1",
    type: "response",
    position: { x: 0, y: 160 },
    data: { text: "The capital of France is Paris." },
  },
  {
    id: "prompt-2",
    type: "prompt",
    position: { x: -220, y: 320 },
    data: { text: "What is its population?" },
  },
  {
    id: "prompt-3",
    type: "prompt",
    position: { x: 220, y: 320 },
    data: { text: "What are must-see landmarks?" },
  },
  {
    id: "response-2",
    type: "response",
    position: { x: 220, y: 480 },
    data: {
      text: "The Eiffel Tower, the Louvre, and Notre-Dame are the most visited landmarks.",
    },
  },
];

export const sampleEdges: GraphEdge[] = [
  { id: "e-prompt-1-response-1", source: "prompt-1", target: "response-1" },
  { id: "e-response-1-prompt-2", source: "response-1", target: "prompt-2" },
  { id: "e-response-1-prompt-3", source: "response-1", target: "prompt-3" },
  { id: "e-prompt-3-response-2", source: "prompt-3", target: "response-2" },
];
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test -- sampleGraph
```

Expected: PASS, 5/5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/graph.ts src/lib/sampleGraph.ts src/lib/sampleGraph.test.ts
git commit -m "Add graph data types and deterministic sample conversation tree"
```

---

### Task 3: Zustand graph store

**Files:**
- Create: `src/store/graphStore.ts`
- Create: `src/store/graphStore.test.ts`

**Interfaces:**
- Consumes: `GraphNodeData` from `src/types/graph.ts`, `sampleNodes`/`sampleEdges` from `src/lib/sampleGraph.ts` (Task 2).
- Produces: `useGraphStore` (Zustand hook) exposing `{ nodes: Node<GraphNodeData>[], edges: Edge[], onNodesChange(changes: NodeChange[]): void, onEdgesChange(changes: EdgeChange[]): void, onConnect(connection: Connection): void }` from `src/store/graphStore.ts`. Task 4 (GraphCanvas) consumes this hook directly.

- [ ] **Step 1: Write the failing tests**

Create `src/store/graphStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useGraphStore } from "./graphStore";

describe("useGraphStore", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        { id: "a", type: "prompt", position: { x: 0, y: 0 }, data: { text: "A" } },
        { id: "b", type: "response", position: { x: 0, y: 100 }, data: { text: "B" } },
      ],
      edges: [],
    });
  });

  it("initializes from the sample graph by default", () => {
    // Reset to the module's real initial state to check the default seed.
    useGraphStore.setState(useGraphStore.getInitialState());
    expect(useGraphStore.getState().nodes.length).toBeGreaterThan(0);
    expect(useGraphStore.getState().edges.length).toBeGreaterThan(0);
  });

  it("applies a position change to the matching node", () => {
    useGraphStore.getState().onNodesChange([
      { id: "a", type: "position", position: { x: 50, y: 75 } },
    ]);
    const node = useGraphStore.getState().nodes.find((n) => n.id === "a");
    expect(node?.position).toEqual({ x: 50, y: 75 });
  });

  it("removes a node on a remove change", () => {
    useGraphStore.getState().onNodesChange([{ id: "a", type: "remove" }]);
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["b"]);
  });

  it("adds an edge on connect", () => {
    useGraphStore
      .getState()
      .onConnect({ source: "a", target: "b", sourceHandle: null, targetHandle: null });
    expect(useGraphStore.getState().edges).toHaveLength(1);
    expect(useGraphStore.getState().edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("removes an edge on an edge remove change", () => {
    useGraphStore.setState({
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    useGraphStore.getState().onEdgesChange([{ id: "e1", type: "remove" }]);
    expect(useGraphStore.getState().edges).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- graphStore
```

Expected: FAIL — `src/store/graphStore.ts` does not exist yet.

- [ ] **Step 3: Implement the store**

Create `src/store/graphStore.ts`:

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

interface GraphState {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: sampleNodes,
  edges: sampleEdges,
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),
}));
```

`GraphNode`/`GraphEdge` (Task 2) were designed to structurally satisfy `Node<GraphNodeData>`/`Edge` — verify with `npm run build` (Step 4) rather than assuming.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- graphStore
npm run build
```

Expected: PASS, 5/5 tests; `npm run build` (which runs `tsc`) passes with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/store/graphStore.ts src/store/graphStore.test.ts
git commit -m "Add Zustand graph store wrapping React Flow change handlers"
```

---

### Task 4: Custom node components and the graph canvas

**Files:**
- Create: `src/components/nodes/PromptNode.tsx`
- Create: `src/components/nodes/ResponseNode.tsx`
- Create: `src/components/GraphCanvas.tsx`
- Create: `src/components/GraphCanvas.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Delete: `src/App.css` (replaced by Tailwind via `src/index.css`)

**Interfaces:**
- Consumes: `useGraphStore` from `src/store/graphStore.ts` (Task 3), `sampleNodes`/`sampleEdges` from `src/lib/sampleGraph.ts` (Task 2, used only in the test).
- Produces: `GraphCanvas` component rendered by `App`. This is the last task in this plan — nothing downstream depends on its exports beyond `App.tsx`.

- [ ] **Step 1: Write the failing test for the canvas**

Create `src/components/GraphCanvas.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./GraphCanvas";
import { useGraphStore } from "../store/graphStore";
import { sampleNodes, sampleEdges } from "../lib/sampleGraph";

beforeEach(() => {
  useGraphStore.setState({ nodes: sampleNodes, edges: sampleEdges });
});

describe("GraphCanvas", () => {
  it("renders every sample node by its text", () => {
    render(
      <ReactFlowProvider>
        <GraphCanvas />
      </ReactFlowProvider>,
    );
    for (const node of sampleNodes) {
      expect(screen.getByText(node.data.text)).toBeInTheDocument();
    }
  });

  it("renders one edge element per sample edge", () => {
    const { container } = render(
      <ReactFlowProvider>
        <GraphCanvas />
      </ReactFlowProvider>,
    );
    const edgeElements = container.querySelectorAll(".react-flow__edge");
    expect(edgeElements).toHaveLength(sampleEdges.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -- GraphCanvas
```

Expected: FAIL — `src/components/GraphCanvas.tsx` does not exist yet.

- [ ] **Step 3: Create the custom node components**

Create `src/components/nodes/PromptNode.tsx`:

```tsx
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";

type PromptNodeType = Node<GraphNodeData, "prompt">;

export function PromptNode({ data }: NodeProps<PromptNodeType>) {
  return (
    <div className="max-w-xs rounded-lg border border-cyan-500/40 bg-slate-900/90 px-4 py-3 text-sm text-amber-50 shadow-md">
      <Handle type="target" position={Position.Top} />
      <p className="mb-1 text-xs text-cyan-400">❯ prompt</p>
      <p>{data.text}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

Create `src/components/nodes/ResponseNode.tsx`:

```tsx
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { GraphNodeData } from "../../types/graph";

type ResponseNodeType = Node<GraphNodeData, "response">;

export function ResponseNode({ data }: NodeProps<ResponseNodeType>) {
  return (
    <div className="max-w-xs rounded-lg border border-emerald-500/40 bg-slate-900/90 px-4 py-3 text-sm text-amber-50 shadow-md">
      <Handle type="target" position={Position.Top} />
      <p className="mb-1 text-xs text-emerald-400">response</p>
      <p>{data.text}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

This generic shape (`NodeProps<Node<GraphNodeData, "prompt">>`) was verified against `@xyflow/react@12.11.2`'s installed type definitions — see Global Constraints.

- [ ] **Step 4: Create the canvas component**

Create `src/components/GraphCanvas.tsx`:

```tsx
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "../store/graphStore";
import { PromptNode } from "./nodes/PromptNode";
import { ResponseNode } from "./nodes/ResponseNode";

const nodeTypes = { prompt: PromptNode, response: ResponseNode };

export function GraphCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useGraphStore();

  return (
    <div className="h-screen w-screen bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#3f3f46" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 5: Wire into the app entry point**

Replace `src/App.tsx` with:

```tsx
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./components/GraphCanvas";

function App() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}

export default App;
```

In `src/main.tsx`, replace the `import "./App.css";` line (if present) with `import "./index.css";`. Keep the rest of `main.tsx` (the `ReactDOM.createRoot` call, `StrictMode`, etc.) unchanged.

Delete `src/App.css`. If `src/assets/react.svg` is no longer imported anywhere after this change, delete it too; otherwise leave it.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test -- GraphCanvas
npm run build
npm run lint
```

Expected: both `GraphCanvas` tests pass; `npm run build` and `npm run lint` succeed with no errors (lint warnings are acceptable, errors are not).

- [ ] **Step 7: Manual visual verification**

Run the full app and confirm interactively (this cannot be automated in jsdom):

```bash
npm run tauri dev
```

In the opened window, confirm: the five sample nodes render with visible text, edges connect them with curved lines, dragging a node moves it, scrolling/pinch zooms the canvas, and the minimap + controls are visible. Report what you observed (or could not observe, and why) in your task report — do not claim this step passed without actually running the app.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/PromptNode.tsx src/components/nodes/ResponseNode.tsx src/components/GraphCanvas.tsx src/components/GraphCanvas.test.tsx src/App.tsx src/main.tsx
git rm src/App.css
git add -A
git commit -m "Add custom node components and wire the graph canvas into App"
```

---

## Definition of Done

- [ ] `npm run build`, `npm run lint`, `npm run test`, `npm run format:check` all pass with zero errors.
- [ ] `npm run tauri dev` opens a window showing the five-node sample conversation tree, draggable and zoomable, with curved edges and a dot-grid background.
- [ ] No task introduced a dependency, abstraction, or file not listed in this plan's File Structure.
