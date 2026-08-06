import { describe, it, expect, beforeEach } from "vitest";
import { useGraphStore } from "./graphStore";

describe("useGraphStore", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        {
          id: "a",
          type: "prompt",
          position: { x: 0, y: 0 },
          data: { text: "A" },
        },
        {
          id: "b",
          type: "response",
          position: { x: 0, y: 100 },
          data: { text: "B" },
        },
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
    useGraphStore
      .getState()
      .onNodesChange([
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
    useGraphStore.getState().onConnect({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });
    expect(useGraphStore.getState().edges).toHaveLength(1);
    expect(useGraphStore.getState().edges[0]).toMatchObject({
      source: "a",
      target: "b",
    });
  });

  it("removes an edge on an edge remove change", () => {
    useGraphStore.setState({
      edges: [{ id: "e1", source: "a", target: "b" }],
    });
    useGraphStore.getState().onEdgesChange([{ id: "e1", type: "remove" }]);
    expect(useGraphStore.getState().edges).toHaveLength(0);
  });
});
