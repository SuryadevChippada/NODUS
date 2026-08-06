import { describe, it, expect, beforeEach, vi } from "vitest";
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
        {
          id: "a",
          type: "prompt",
          position: { x: 0, y: 0 },
          data: { text: "A" },
        },
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
    });
    useGraphStore.getState().onConnect({
      source: "a",
      target: "b",
      sourceHandle: null,
      targetHandle: null,
    });
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
