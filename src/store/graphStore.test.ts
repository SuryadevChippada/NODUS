import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGraphStore, __resetHydratePromiseForTests } from "./graphStore";
import { sampleNodes, sampleEdges } from "../lib/sampleGraph";

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
  updateNodeText: vi.fn().mockResolvedValue(undefined),
  updateNodeAnswer: vi.fn().mockResolvedValue(undefined),
  deleteNode: vi.fn().mockResolvedValue(undefined),
  insertEdge: vi.fn().mockResolvedValue(undefined),
  deleteEdge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/providers/mockProvider", () => ({
  generateMockResponse: vi.fn(),
}));

import * as db from "../lib/db";
import { generateMockResponse } from "../lib/providers/mockProvider";

describe("useGraphStore hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState(useGraphStore.getInitialState());
    __resetHydratePromiseForTests();
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

  it("is idempotent under concurrent invocation (regression: React StrictMode double-invoke raced two hydrate() calls into inserting duplicate workspace/session rows)", async () => {
    vi.mocked(db.ensureDefaultWorkspaceAndSession).mockResolvedValue({
      workspaceId: "w1",
      sessionId: "s1",
      isNewSession: true,
    });
    vi.mocked(db.loadSessionGraph).mockResolvedValue({ nodes: [], edges: [] });

    await Promise.all([
      useGraphStore.getState().hydrate(),
      useGraphStore.getState().hydrate(),
    ]);

    expect(db.ensureDefaultWorkspaceAndSession).toHaveBeenCalledTimes(1);
    expect(db.insertNode).toHaveBeenCalledTimes(sampleNodes.length);
    expect(db.insertEdge).toHaveBeenCalledTimes(sampleEdges.length);
  });

  it("returns the same promise / does not re-run once already hydrated", async () => {
    vi.mocked(db.ensureDefaultWorkspaceAndSession).mockResolvedValue({
      workspaceId: "w1",
      sessionId: "s1",
      isNewSession: false,
    });
    vi.mocked(db.loadSessionGraph).mockResolvedValue({ nodes: [], edges: [] });

    await useGraphStore.getState().hydrate();
    await useGraphStore.getState().hydrate();

    expect(db.ensureDefaultWorkspaceAndSession).toHaveBeenCalledTimes(1);
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

describe("useGraphStore persistence error handling", () => {
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

  it("does not throw and logs a failure when a fire-and-forget deleteNode write rejects", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(db.deleteNode).mockRejectedValueOnce(new Error("disk full"));

    expect(() =>
      useGraphStore.getState().onNodesChange([{ id: "a", type: "remove" }]),
    ).not.toThrow();

    // let the rejected promise's .catch handler run
    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());

    consoleErrorSpy.mockRestore();
  });

  it("does not throw and logs a failure when a fire-and-forget insertEdge write rejects on connect", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(db.insertEdge).mockRejectedValueOnce(
      new Error("connection lost"),
    );

    expect(() =>
      useGraphStore.getState().onConnect({
        source: "a",
        target: "b",
        sourceHandle: null,
        targetHandle: null,
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());

    consoleErrorSpy.mockRestore();
  });

  it("does not throw and logs a failure when a fire-and-forget deleteEdge write rejects", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(db.deleteEdge).mockRejectedValueOnce(
      new Error("connection lost"),
    );
    useGraphStore.setState({ edges: [{ id: "e1", source: "a", target: "b" }] });

    expect(() =>
      useGraphStore.getState().onEdgesChange([{ id: "e1", type: "remove" }]),
    ).not.toThrow();

    await vi.waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());

    consoleErrorSpy.mockRestore();
  });

  it("does not throw and logs a failure when a debounced updateNodePosition write rejects", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(db.updateNodePosition).mockRejectedValueOnce(
      new Error("connection lost"),
    );

    expect(() =>
      useGraphStore
        .getState()
        .onNodesChange([
          { id: "a", type: "position", position: { x: 50, y: 75 } },
        ]),
    ).not.toThrow();

    await vi.advanceTimersByTimeAsync(500);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe("useGraphStore.addNode", () => {
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

  it("adds a new root node with no parent and no new edge", () => {
    const newNodeId = useGraphStore.getState().addNode(null, "New node");
    const state = useGraphStore.getState();
    expect(state.nodes).toHaveLength(2);
    const newNode = state.nodes.find((n) => n.id !== "a");
    expect(newNodeId).toBe(newNode?.id);
    expect(newNode).toMatchObject({
      type: "prompt",
      data: { text: "New node" },
    });
    expect(state.edges).toHaveLength(0);
    expect(vi.mocked(db.insertNode)).toHaveBeenCalledWith("s1", newNode);
    expect(vi.mocked(db.insertEdge)).not.toHaveBeenCalled();
  });

  it("adds a child node connected to the given parent", () => {
    const newNodeId = useGraphStore.getState().addNode("a", "Child node");
    const state = useGraphStore.getState();
    expect(state.nodes).toHaveLength(2);
    const newNode = state.nodes.find((n) => n.id !== "a");
    expect(newNodeId).toBe(newNode?.id);
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({ source: "a", target: newNode?.id });
    expect(vi.mocked(db.insertEdge)).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ source: "a", target: newNode?.id }),
    );
  });
});

describe("useGraphStore.updateNodeText (store action)", () => {
  it("updates the node's text in state and persists it", () => {
    useGraphStore.setState({
      nodes: [
        {
          id: "a",
          type: "prompt",
          position: { x: 0, y: 0 },
          data: { text: "old" },
        },
      ],
    });
    useGraphStore.getState().updateNodeText("a", "new text");
    expect(useGraphStore.getState().nodes[0].data.text).toBe("new text");
    expect(vi.mocked(db.updateNodeText)).toHaveBeenCalledWith("a", "new text");
  });

  it("preserves an existing suggestedBranches value on the node's data instead of wiping it", () => {
    useGraphStore.setState({
      nodes: [
        {
          id: "a",
          type: "response",
          position: { x: 0, y: 0 },
          data: {
            text: "old answer",
            suggestedBranches: [{ label: "L", prompt: "P" }],
          },
        },
      ],
    });
    useGraphStore.getState().updateNodeText("a", "edited answer");
    const node = useGraphStore.getState().nodes[0];
    expect(node.data.text).toBe("edited answer");
    expect(node.data.suggestedBranches).toEqual([{ label: "L", prompt: "P" }]);
  });
});

describe("useGraphStore delete actions", () => {
  // Tree: a -> b -> c, a -> d
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
        {
          id: "b",
          type: "prompt",
          position: { x: 0, y: 100 },
          data: { text: "B" },
        },
        {
          id: "c",
          type: "prompt",
          position: { x: 0, y: 200 },
          data: { text: "C" },
        },
        {
          id: "d",
          type: "prompt",
          position: { x: 100, y: 100 },
          data: { text: "D" },
        },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "a", target: "d" },
      ],
    });
  });

  it("deleteNodeWithDescendants removes the node and all its descendants, in state and in the database", () => {
    useGraphStore.getState().deleteNodeWithDescendants("b");
    const state = useGraphStore.getState();
    expect(state.nodes.map((n) => n.id).sort()).toEqual(["a", "d"]);
    expect(state.edges.map((e) => e.id).sort()).toEqual(["e3"]);
    expect(vi.mocked(db.deleteNode)).toHaveBeenCalledWith("b");
    expect(vi.mocked(db.deleteNode)).toHaveBeenCalledWith("c");
    expect(vi.mocked(db.deleteEdge)).toHaveBeenCalledWith("e1");
    expect(vi.mocked(db.deleteEdge)).toHaveBeenCalledWith("e2");
  });

  it("deleteNodeAndReparentChildren removes only the node and reconnects its children to its parent", () => {
    useGraphStore.getState().deleteNodeAndReparentChildren("b");
    const state = useGraphStore.getState();
    expect(state.nodes.map((n) => n.id).sort()).toEqual(["a", "c", "d"]);
    // c should now be connected directly to a
    const cEdge = state.edges.find((e) => e.target === "c");
    expect(cEdge?.source).toBe("a");
    expect(vi.mocked(db.deleteNode)).toHaveBeenCalledWith("b");
    expect(vi.mocked(db.deleteEdge)).toHaveBeenCalledWith("e1");
    expect(vi.mocked(db.deleteEdge)).toHaveBeenCalledWith("e2");
    expect(vi.mocked(db.insertEdge)).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ source: "a", target: "c" }),
    );
  });

  it("deleteNodeAndReparentChildren on a root node leaves its children as new roots", () => {
    useGraphStore.getState().deleteNodeAndReparentChildren("a");
    const state = useGraphStore.getState();
    expect(state.nodes.map((n) => n.id).sort()).toEqual(["b", "c", "d"]);
    // b and d had no parent to reconnect to — they simply lose their edge from a
    expect(state.edges.map((e) => e.id)).toEqual(["e2"]);
    expect(vi.mocked(db.insertEdge)).not.toHaveBeenCalled();
  });
});

describe("useGraphStore.generateResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState({
      sessionId: "s1",
      generatingNodeId: null,
      nodes: [
        {
          id: "p1",
          type: "prompt",
          position: { x: 0, y: 0 },
          data: { text: "question" },
        },
      ],
      edges: [],
    });
  });

  it("creates a connected response node and marks it as generating", async () => {
    let resolveGenerate: (
      value: Awaited<ReturnType<typeof generateMockResponse>>,
    ) => void = () => {};
    vi.mocked(generateMockResponse).mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );

    const generatePromise = useGraphStore.getState().generateResponse("p1");

    // Let the synchronous portion of generateResponse (node creation) run.
    await Promise.resolve();
    const state = useGraphStore.getState();
    const responseNode = state.nodes.find((n) => n.id !== "p1");
    expect(responseNode).toMatchObject({
      type: "response",
      data: { text: "" },
    });
    expect(state.edges).toEqual([
      expect.objectContaining({ source: "p1", target: responseNode?.id }),
    ]);
    expect(state.generatingNodeId).toBe(responseNode?.id);

    resolveGenerate({
      title: "T",
      answer: "final answer",
      suggestedBranches: [
        { label: "L", prompt: "P" },
        { label: "L2", prompt: "P2" },
        { label: "L3", prompt: "P3" },
      ],
    });
    await generatePromise;

    const finalNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id === responseNode?.id);
    expect(finalNode?.data.text).toBe("final answer");
    expect(finalNode?.data.suggestedBranches?.length).toBe(3);
    expect(useGraphStore.getState().generatingNodeId).toBeNull();
  });

  it("streams onToken callbacks into the response node's text progressively", async () => {
    vi.mocked(generateMockResponse).mockImplementation(
      async (_context, options) => {
        options.onToken("Hello");
        options.onToken(" world");
        return {
          title: "T",
          answer: "Hello world",
          suggestedBranches: [
            { label: "L", prompt: "P" },
            { label: "L2", prompt: "P2" },
            { label: "L3", prompt: "P3" },
          ],
        };
      },
    );

    await useGraphStore.getState().generateResponse("p1");
    const responseNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id !== "p1");
    expect(responseNode?.data.text).toBe("Hello world");
  });

  it("ignores a second generateResponse call while one is already in flight (only one generation/node is created)", async () => {
    let resolveGenerate: (
      value: Awaited<ReturnType<typeof generateMockResponse>>,
    ) => void = () => {};
    vi.mocked(generateMockResponse).mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );

    const firstPromise = useGraphStore.getState().generateResponse("p1");
    await Promise.resolve();

    // Second call while the first is still pending must be a no-op: it
    // should return immediately without calling the provider again or
    // creating a second response node (regression: a bare module-level
    // activeAbortController let generation B's finally clear generation
    // A's controller, silently disarming Stop for A).
    await useGraphStore.getState().generateResponse("p1");

    expect(vi.mocked(generateMockResponse)).toHaveBeenCalledTimes(1);
    expect(
      useGraphStore.getState().nodes.filter((n) => n.id !== "p1"),
    ).toHaveLength(1);

    resolveGenerate({
      title: "T",
      answer: "final answer",
      suggestedBranches: [
        { label: "L", prompt: "P" },
        { label: "L2", prompt: "P2" },
        { label: "L3", prompt: "P3" },
      ],
    });
    await firstPromise;
  });

  it("persists partial streamed text to the database immediately when generation is cancelled mid-stream", async () => {
    let rejectGenerate: (error: unknown) => void = () => {};
    vi.mocked(generateMockResponse).mockImplementation((_context, options) => {
      options.onToken("partial");
      return new Promise((_resolve, reject) => {
        rejectGenerate = reject;
      });
    });

    const generatePromise = useGraphStore.getState().generateResponse("p1");
    await Promise.resolve();

    const responseNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id !== "p1");
    expect(responseNode?.data.text).toBe("partial");

    useGraphStore.getState().cancelGeneration();
    rejectGenerate(new DOMException("Generation cancelled", "AbortError"));
    await generatePromise;

    // The debounced stream-persist timer must not be relied on here — the
    // flush happens synchronously in the catch block, so it's already
    // recorded by the time the cancelled promise has been awaited.
    expect(vi.mocked(db.updateNodeText)).toHaveBeenCalledWith(
      responseNode?.id,
      "partial",
    );
    expect(useGraphStore.getState().generatingNodeId).toBeNull();
  });

  it("cancelGeneration aborts the in-flight generation", async () => {
    let capturedSignal: AbortSignal | undefined;
    let rejectGenerate: (error: unknown) => void = () => {};
    vi.mocked(generateMockResponse).mockImplementation((_context, options) => {
      capturedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        rejectGenerate = reject;
      });
    });

    const generatePromise = useGraphStore.getState().generateResponse("p1");
    await Promise.resolve();

    useGraphStore.getState().cancelGeneration();
    expect(capturedSignal?.aborted).toBe(true);

    rejectGenerate(new DOMException("Generation cancelled", "AbortError"));
    await generatePromise;

    expect(useGraphStore.getState().generatingNodeId).toBeNull();
  });
});
