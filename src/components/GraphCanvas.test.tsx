import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { GraphCanvas } from "./GraphCanvas";
import { useGraphStore } from "../store/graphStore";
import { sampleNodes, sampleEdges } from "../lib/sampleGraph";

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
