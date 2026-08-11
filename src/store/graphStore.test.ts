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
  ensureDefaultIdentity: vi.fn(),
  listIdentities: vi.fn(),
  insertIdentity: vi.fn().mockResolvedValue(undefined),
  updateIdentity: vi.fn().mockResolvedValue(undefined),
  deleteIdentity: vi.fn().mockResolvedValue(undefined),
  listMemories: vi.fn(),
  insertMemory: vi.fn().mockResolvedValue(undefined),
  updateMemory: vi.fn().mockResolvedValue(undefined),
  deleteMemory: vi.fn().mockResolvedValue(undefined),
  reassignMemoriesToGlobal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/providers/mockProvider", () => ({
  generateMockResponse: vi.fn(),
}));
vi.mock("../lib/providers/ollamaProvider", () => ({
  generateOllamaResponse: vi.fn(),
}));
vi.mock("../lib/providers/ollamaClient", () => ({
  checkOllamaHealth: vi.fn(),
}));

import * as db from "../lib/db";
import { generateMockResponse } from "../lib/providers/mockProvider";
import { generateOllamaResponse } from "../lib/providers/ollamaProvider";
import { checkOllamaHealth } from "../lib/providers/ollamaClient";

describe("useGraphStore hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState(useGraphStore.getInitialState());
    __resetHydratePromiseForTests();
    vi.mocked(db.ensureDefaultIdentity).mockResolvedValue({
      id: "identity-default",
      workspaceId: "workspace-1",
      name: "Default",
      symbol: "❯",
      preferredModel: null,
      responseStyle: null,
    });
    vi.mocked(db.listIdentities).mockResolvedValue([
      {
        id: "identity-default",
        workspaceId: "workspace-1",
        name: "Default",
        symbol: "❯",
        preferredModel: null,
        responseStyle: null,
      },
    ]);
    vi.mocked(db.listMemories).mockResolvedValue([]);
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
    vi.mocked(checkOllamaHealth).mockResolvedValue(false);
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

describe("useGraphStore.generateResponse provider selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.setState({
      sessionId: "s1",
      generatingNodeId: null,
      lastGenerationProvider: null,
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

  it("uses the Ollama provider when it's healthy", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    vi.mocked(generateOllamaResponse).mockResolvedValue({
      title: "T",
      answer: "ollama answer",
      suggestedBranches: [
        { label: "A", prompt: "a" },
        { label: "B", prompt: "b" },
        { label: "C", prompt: "c" },
      ],
    });

    await useGraphStore.getState().generateResponse("p1");

    expect(generateOllamaResponse).toHaveBeenCalled();
    expect(vi.mocked(generateMockResponse)).not.toHaveBeenCalled();
    expect(useGraphStore.getState().lastGenerationProvider).toBe("ollama");
  });

  it("falls back to the mock provider when Ollama is not healthy", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue(false);
    vi.mocked(generateMockResponse).mockResolvedValue({
      title: "T",
      answer: "mock answer",
      suggestedBranches: [
        { label: "A", prompt: "a" },
        { label: "B", prompt: "b" },
        { label: "C", prompt: "c" },
      ],
    });

    await useGraphStore.getState().generateResponse("p1");

    expect(generateOllamaResponse).not.toHaveBeenCalled();
    expect(vi.mocked(generateMockResponse)).toHaveBeenCalled();
    expect(useGraphStore.getState().lastGenerationProvider).toBe("mock");
  });

  it("falls back to the mock provider when Ollama is healthy but the generation call itself throws", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    vi.mocked(generateOllamaResponse).mockRejectedValue(
      new Error("model crashed"),
    );
    vi.mocked(generateMockResponse).mockResolvedValue({
      title: "T",
      answer: "mock answer",
      suggestedBranches: [
        { label: "A", prompt: "a" },
        { label: "B", prompt: "b" },
        { label: "C", prompt: "c" },
      ],
    });

    await useGraphStore.getState().generateResponse("p1");

    expect(useGraphStore.getState().lastGenerationProvider).toBe("mock");
    const responseNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id !== "p1");
    expect(responseNode?.data.text).toBe("mock answer");
  });

  it("clears Ollama's partial text before the mock's own stream starts, so they never visibly concatenate", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    vi.mocked(generateOllamaResponse).mockImplementation(
      async (_context, options) => {
        options.onToken("ollama partial ");
        throw new Error("connection dropped");
      },
    );

    let textDuringMockFirstToken: string | undefined;
    vi.mocked(generateMockResponse).mockImplementation(
      async (_context, options) => {
        options.onToken("mock ");
        textDuringMockFirstToken = useGraphStore
          .getState()
          .nodes.find((n) => n.id !== "p1")?.data.text;
        return {
          title: "T",
          answer: "mock answer",
          suggestedBranches: [
            { label: "A", prompt: "a" },
            { label: "B", prompt: "b" },
            { label: "C", prompt: "c" },
          ],
        };
      },
    );

    await useGraphStore.getState().generateResponse("p1");

    // The assertion that matters: at the moment the mock's own stream
    // produced its first token, the node's text must not still contain
    // Ollama's leftover partial answer. Checking only the final text
    // (after the mock's full completion overwrites it) would pass even
    // without the fix, since completion always overwrites wholesale.
    expect(textDuringMockFirstToken).toBe("mock ");
    expect(textDuringMockFirstToken).not.toContain("ollama partial");
  });

  it("treats a real in-flight Ollama abort as cancellation, not a failure to fall back from", async () => {
    // @tauri-apps/plugin-http does NOT reject with a DOMException on a real
    // in-flight abort — it rejects with a plain Error (or a bare string via
    // the stream controller), message "Request cancelled". A discriminator
    // that only matched `DOMException` + "AbortError" (the shape the mock
    // provider and the pre-request-abort paths use) missed this real shape
    // entirely, misclassifying a user's Stop click as an Ollama failure.
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    let rejectGenerate: (error: unknown) => void = () => {};
    vi.mocked(generateOllamaResponse).mockImplementation(
      (_context, options) => {
        options.onToken("partial ollama answer");
        return new Promise((_resolve, reject) => {
          rejectGenerate = reject;
        });
      },
    );

    const generatePromise = useGraphStore.getState().generateResponse("p1");
    await Promise.resolve();

    useGraphStore.getState().cancelGeneration();
    rejectGenerate(new Error("Request cancelled"));
    await generatePromise;

    expect(generateMockResponse).not.toHaveBeenCalled();
    const responseNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id !== "p1");
    expect(responseNode?.data.text).toBe("partial ollama answer");
    expect(useGraphStore.getState().generatingNodeId).toBeNull();
  });

  it("snapshots the active identity onto the response node and passes its preferred model/style to generateOllamaResponse", async () => {
    useGraphStore.setState({
      identities: [
        {
          id: "identity-1",
          workspaceId: "workspace-1",
          name: "Researcher",
          symbol: "R",
          preferredModel: "llama3.1:latest",
          responseStyle: "concise",
        },
      ],
      activeIdentityId: "identity-1",
    });
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    vi.mocked(generateOllamaResponse).mockResolvedValue({
      title: "T",
      answer: "answer",
      suggestedBranches: [
        { label: "A", prompt: "a" },
        { label: "B", prompt: "b" },
        { label: "C", prompt: "c" },
      ],
    });

    await useGraphStore.getState().generateResponse("p1");

    expect(generateOllamaResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: "llama3.1:latest",
        responseStyle: "concise",
      }),
    );
    const responseNode = useGraphStore
      .getState()
      .nodes.find((n) => n.id !== "p1");
    expect(responseNode?.data.identityName).toBe("Researcher");
    expect(responseNode?.data.identitySymbol).toBe("R");
  });

  it("keeps the identity snapshot on the response node through mid-stream onToken updates", async () => {
    useGraphStore.setState({
      identities: [
        {
          id: "identity-1",
          workspaceId: "workspace-1",
          name: "Researcher",
          symbol: "R",
          preferredModel: null,
          responseStyle: null,
        },
      ],
      activeIdentityId: "identity-1",
    });
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);

    let identitySymbolDuringStream: string | undefined;
    vi.mocked(generateOllamaResponse).mockImplementation(
      async (_context, options) => {
        options.onToken("partial ");
        identitySymbolDuringStream = useGraphStore
          .getState()
          .nodes.find((n) => n.id !== "p1")?.data.identitySymbol;
        return {
          title: "T",
          answer: "partial answer",
          suggestedBranches: [
            { label: "A", prompt: "a" },
            { label: "B", prompt: "b" },
            { label: "C", prompt: "c" },
          ],
        };
      },
    );

    await useGraphStore.getState().generateResponse("p1");

    // This must be checked mid-stream (inside onToken, above), not just
    // after generateResponse resolves — the final completion set() also
    // preserves the snapshot, so checking only the end state would pass
    // even if the streaming set() silently dropped it.
    expect(identitySymbolDuringStream).toBe("R");
  });

  it("keeps the identity snapshot on the response node through the Ollama-failure-to-mock-fallback text clear", async () => {
    useGraphStore.setState({
      identities: [
        {
          id: "identity-1",
          workspaceId: "workspace-1",
          name: "Researcher",
          symbol: "R",
          preferredModel: null,
          responseStyle: null,
        },
      ],
      activeIdentityId: "identity-1",
    });
    vi.mocked(checkOllamaHealth).mockResolvedValue(true);
    vi.mocked(generateOllamaResponse).mockImplementation(
      async (_context, options) => {
        options.onToken("ollama partial ");
        throw new Error("connection dropped");
      },
    );

    let identitySymbolAfterFallbackClear: string | undefined;
    vi.mocked(generateMockResponse).mockImplementation(
      async (_context, options) => {
        identitySymbolAfterFallbackClear = useGraphStore
          .getState()
          .nodes.find((n) => n.id !== "p1")?.data.identitySymbol;
        options.onToken("mock ");
        return {
          title: "T",
          answer: "mock answer",
          suggestedBranches: [
            { label: "A", prompt: "a" },
            { label: "B", prompt: "b" },
            { label: "C", prompt: "c" },
          ],
        };
      },
    );

    await useGraphStore.getState().generateResponse("p1");

    // Checked at the moment the fallback's text-clearing set() has already
    // run (right before the mock provider's own stream starts) — this is
    // exactly the set() call that only ever spread `text`, not the full
    // node.data, before the fix this test guards.
    expect(identitySymbolAfterFallbackClear).toBe("R");
  });
});

describe("identity state and actions", () => {
  beforeEach(() => {
    // Every other describe block in this file clears mock call history in
    // its beforeEach; this one needs it too so an earlier test's
    // db.deleteIdentity call doesn't leak into a later "not called"
    // assertion (see "deleteIdentity refuses to delete the last remaining
    // identity" below).
    vi.clearAllMocks();
    __resetHydratePromiseForTests();
    useGraphStore.setState({
      workspaceId: "workspace-1",
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

  it("hydrate() loads identities and sets activeIdentityId to the earliest one", async () => {
    vi.mocked(db.ensureDefaultWorkspaceAndSession).mockResolvedValue({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      isNewSession: false,
    });
    vi.mocked(db.loadSessionGraph).mockResolvedValue({ nodes: [], edges: [] });
    vi.mocked(db.listIdentities).mockResolvedValue([
      {
        id: "identity-existing",
        workspaceId: "workspace-1",
        name: "Researcher",
        symbol: "R",
        preferredModel: "llama3.1:latest",
        responseStyle: null,
      },
    ]);
    vi.mocked(db.ensureDefaultIdentity).mockResolvedValue({
      id: "identity-existing",
      workspaceId: "workspace-1",
      name: "Researcher",
      symbol: "R",
      preferredModel: "llama3.1:latest",
      responseStyle: null,
    });

    await useGraphStore.getState().hydrate();

    expect(useGraphStore.getState().identities).toEqual([
      {
        id: "identity-existing",
        workspaceId: "workspace-1",
        name: "Researcher",
        symbol: "R",
        preferredModel: "llama3.1:latest",
        responseStyle: null,
      },
    ]);
    expect(useGraphStore.getState().activeIdentityId).toBe("identity-existing");
    expect(useGraphStore.getState().workspaceId).toBe("workspace-1");
  });

  it("setActiveIdentity switches the active identity", () => {
    useGraphStore.getState().setActiveIdentity("identity-2");
    expect(useGraphStore.getState().activeIdentityId).toBe("identity-2");
  });

  it("createIdentity adds a new identity and persists it", () => {
    const newId = useGraphStore.getState().createIdentity({
      name: "Researcher",
      symbol: "R",
      preferredModel: "llama3.1:latest",
      responseStyle: "concise",
    });
    const identities = useGraphStore.getState().identities;
    expect(identities).toHaveLength(2);
    expect(identities.find((i) => i.id === newId)).toEqual({
      id: newId,
      workspaceId: "workspace-1",
      name: "Researcher",
      symbol: "R",
      preferredModel: "llama3.1:latest",
      responseStyle: "concise",
    });
    expect(db.insertIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: newId, name: "Researcher" }),
    );
  });

  it("updateIdentity edits an existing identity in place and persists it", () => {
    useGraphStore.getState().updateIdentity("identity-1", {
      name: "Renamed",
      symbol: "X",
      preferredModel: "qwen2:7b",
      responseStyle: "detailed",
    });
    const identity = useGraphStore
      .getState()
      .identities.find((i) => i.id === "identity-1");
    expect(identity).toEqual({
      id: "identity-1",
      workspaceId: "workspace-1",
      name: "Renamed",
      symbol: "X",
      preferredModel: "qwen2:7b",
      responseStyle: "detailed",
    });
    expect(db.updateIdentity).toHaveBeenCalledWith(
      "identity-1",
      expect.objectContaining({ name: "Renamed" }),
    );
  });

  it("deleteIdentity removes a non-active identity", () => {
    useGraphStore.setState({
      identities: [
        ...useGraphStore.getState().identities,
        {
          id: "identity-2",
          workspaceId: "workspace-1",
          name: "Second",
          symbol: "S",
          preferredModel: null,
          responseStyle: null,
        },
      ],
    });
    useGraphStore.getState().deleteIdentity("identity-2");
    expect(
      useGraphStore.getState().identities.find((i) => i.id === "identity-2"),
    ).toBeUndefined();
    expect(useGraphStore.getState().activeIdentityId).toBe("identity-1");
    expect(db.deleteIdentity).toHaveBeenCalledWith("identity-2");
  });

  it("deleteIdentity refuses to delete the last remaining identity", () => {
    useGraphStore.getState().deleteIdentity("identity-1");
    expect(useGraphStore.getState().identities).toHaveLength(1);
    expect(db.deleteIdentity).not.toHaveBeenCalled();
  });

  it("deleteIdentity falls back to another identity when deleting the active one", () => {
    useGraphStore.setState({
      identities: [
        ...useGraphStore.getState().identities,
        {
          id: "identity-2",
          workspaceId: "workspace-1",
          name: "Second",
          symbol: "S",
          preferredModel: null,
          responseStyle: null,
        },
      ],
      activeIdentityId: "identity-1",
    });
    useGraphStore.getState().deleteIdentity("identity-1");
    expect(useGraphStore.getState().activeIdentityId).toBe("identity-2");
  });

  it("addNode snapshots the active identity's name and symbol onto the new node", () => {
    useGraphStore.setState({ sessionId: "session-1", nodes: [], edges: [] });
    const newId = useGraphStore.getState().addNode(null, "hello");
    const node = useGraphStore.getState().nodes.find((n) => n.id === newId);
    expect(node?.data.identityName).toBe("Default");
    expect(node?.data.identitySymbol).toBe("❯");
  });
});

describe("memory state and actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetHydratePromiseForTests();
    useGraphStore.setState({
      workspaceId: "workspace-1",
      identities: [
        {
          id: "identity-1",
          workspaceId: "workspace-1",
          name: "Default",
          symbol: "❯",
          preferredModel: null,
          responseStyle: null,
        },
        {
          id: "identity-2",
          workspaceId: "workspace-1",
          name: "Second",
          symbol: "S",
          preferredModel: null,
          responseStyle: null,
        },
      ],
      activeIdentityId: "identity-1",
      memories: [],
    });
  });

  it("createMemory adds a global memory and persists it", () => {
    const newId = useGraphStore.getState().createMemory({
      content: "Prefers concise answers",
      identityId: null,
    });
    const memories = useGraphStore.getState().memories;
    expect(memories).toHaveLength(1);
    expect(memories[0]).toEqual({
      id: newId,
      workspaceId: "workspace-1",
      identityId: null,
      content: "Prefers concise answers",
    });
    expect(db.insertMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: newId,
        content: "Prefers concise answers",
      }),
    );
  });

  it("createMemory adds an identity-scoped memory", () => {
    const newId = useGraphStore.getState().createMemory({
      content: "Prefers Python",
      identityId: "identity-2",
    });
    const memory = useGraphStore
      .getState()
      .memories.find((m) => m.id === newId);
    expect(memory?.identityId).toBe("identity-2");
  });

  it("updateMemory edits content and rescopes an existing memory, persisting it", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: null,
          content: "Old content",
        },
      ],
    });
    useGraphStore.getState().updateMemory("memory-1", {
      content: "New content",
      identityId: "identity-1",
    });
    const memory = useGraphStore
      .getState()
      .memories.find((m) => m.id === "memory-1");
    expect(memory).toEqual({
      id: "memory-1",
      workspaceId: "workspace-1",
      identityId: "identity-1",
      content: "New content",
    });
    expect(db.updateMemory).toHaveBeenCalledWith(
      "memory-1",
      expect.objectContaining({ content: "New content" }),
    );
  });

  it("deleteMemory removes a memory and persists the deletion", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: null,
          content: "To be deleted",
        },
      ],
    });
    useGraphStore.getState().deleteMemory("memory-1");
    expect(useGraphStore.getState().memories).toHaveLength(0);
    expect(db.deleteMemory).toHaveBeenCalledWith("memory-1");
  });

  it("deleteIdentity reassigns that identity's memories to global scope instead of orphaning them", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: "identity-2",
          content: "Scoped to identity-2",
        },
        {
          id: "memory-2",
          workspaceId: "workspace-1",
          identityId: null,
          content: "Already global",
        },
      ],
    });

    useGraphStore.getState().deleteIdentity("identity-2");

    const memories = useGraphStore.getState().memories;
    expect(memories.find((m) => m.id === "memory-1")?.identityId).toBeNull();
    expect(memories.find((m) => m.id === "memory-2")?.identityId).toBeNull();
    expect(db.reassignMemoriesToGlobal).toHaveBeenCalledWith("identity-2");
  });
});
