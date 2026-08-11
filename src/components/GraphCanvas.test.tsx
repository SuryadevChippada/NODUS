import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./GraphCanvas";
import { useGraphStore } from "../store/graphStore";
import { sampleNodes, sampleEdges } from "../lib/sampleGraph";

// The "+ New" button exercises the store's addNode, which is gated on a
// non-null sessionId (same gate every other write path in the store uses)
// and fires off a real db.insertNode() write. Mock the db module — same
// pattern as src/store/graphStore.test.ts — so that write doesn't fall
// through to the real @tauri-apps/plugin-sql, which isn't available here.
vi.mock("../lib/db", () => ({
  insertNode: vi.fn().mockResolvedValue(undefined),
  insertEdge: vi.fn().mockResolvedValue(undefined),
  insertIdentity: vi.fn().mockResolvedValue(undefined),
  updateIdentity: vi.fn().mockResolvedValue(undefined),
  deleteIdentity: vi.fn().mockResolvedValue(undefined),
}));

// jsdom has no layout engine: elements always report 0 offsetWidth/Height,
// so @xyflow/react's ResizeObserver-driven node measurement never
// completes and edges (which require measured handle bounds) never
// render. Give elements a non-zero size and make ResizeObserver actually
// invoke its callback so React Flow can finish measuring nodes here.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 100,
  });

  class MeasuringResizeObserver {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 200, height: 100 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    MeasuringResizeObserver as unknown as typeof ResizeObserver;

  // jsdom also has no DOMMatrix implementation, which @xyflow/react reads
  // during measurement to get the current zoom level from the viewport's
  // CSS transform. Nothing in this test pans or zooms, so identity (no
  // scale) is accurate.
  class DOMMatrixReadOnlyMock {
    m22 = 1;
  }
  globalThis.DOMMatrixReadOnly =
    DOMMatrixReadOnlyMock as unknown as typeof DOMMatrixReadOnly;
});

beforeEach(() => {
  useGraphStore.setState({
    sessionId: "test-session",
    nodes: sampleNodes,
    edges: sampleEdges,
    identities: [
      {
        id: "identity-1",
        workspaceId: "workspace-1",
        name: "Default",
        symbol: "❯",
        preferredModel: null,
        responseStyle: null,
      },
    ],
    activeIdentityId: "identity-1",
  });
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

  it('creates a new root node when the "+ New" button is clicked', () => {
    render(
      <ReactFlowProvider>
        <GraphCanvas />
      </ReactFlowProvider>,
    );
    const before = useGraphStore.getState().nodes.length;
    fireEvent.click(screen.getByRole("button", { name: /\+ new/i }));
    expect(useGraphStore.getState().nodes.length).toBe(before + 1);
  });
});
