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
import type { GraphNode, GraphNodeData } from "../types/graph";
import type { Identity } from "../types/identity";
import type { Memory } from "../types/memory";
import * as db from "../lib/db";
import {
  getChildIds,
  getParentId,
  getDescendantIds,
} from "../lib/graphTraversal";
import { generateMockResponse } from "../lib/providers/mockProvider";
import { generateOllamaResponse } from "../lib/providers/ollamaProvider";
import { checkOllamaHealth } from "../lib/providers/ollamaClient";
import { buildBranchContext } from "../lib/branchContext";
import type { ProviderResponse } from "../types/provider";

const POSITION_SAVE_DEBOUNCE_MS = 400;
const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const TEXT_STREAM_PERSIST_DEBOUNCE_MS = 400;
let streamPersistTimer: ReturnType<typeof setTimeout> | null = null;
let activeAbortController: AbortController | null = null;

// Memoized in-flight/completed hydrate() promise, same pattern as getDb() in
// src/lib/db.ts. Without this, React StrictMode's double-invoked effect (or
// any other concurrent/repeat call) races two hydrate() runs against an
// empty database, and both take the isNewSession branch, inserting a
// duplicate workspace/session.
let hydratePromise: Promise<void> | null = null;

// ponytail: test-only escape hatch so each test case can simulate a fresh
// app launch; never called from production code.
export function __resetHydratePromiseForTests(): void {
  hydratePromise = null;
}

interface GraphState {
  sessionId: string | null;
  workspaceId: string | null;
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  identities: Identity[];
  activeIdentityId: string | null;
  memories: Memory[];
  hydrate: () => Promise<void>;
  onNodesChange: (changes: NodeChange<Node<GraphNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (parentId: string | null, text: string) => string;
  updateNodeText: (nodeId: string, text: string) => void;
  deleteNodeWithDescendants: (nodeId: string) => void;
  deleteNodeAndReparentChildren: (nodeId: string) => void;
  generatingNodeId: string | null;
  lastGenerationProvider: "ollama" | "mock" | null;
  generateResponse: (promptNodeId: string) => Promise<void>;
  cancelGeneration: () => void;
  setActiveIdentity: (id: string) => void;
  createIdentity: (input: {
    name: string;
    symbol: string;
    preferredModel: string | null;
    responseStyle: string | null;
  }) => string;
  updateIdentity: (
    id: string,
    updates: {
      name: string;
      symbol: string;
      preferredModel: string | null;
      responseStyle: string | null;
    },
  ) => void;
  deleteIdentity: (id: string) => void;
  createMemory: (input: {
    content: string;
    identityId: string | null;
  }) => string;
  updateMemory: (
    id: string,
    updates: { content: string; identityId: string | null },
  ) => void;
  deleteMemory: (id: string) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  sessionId: null,
  workspaceId: null,
  nodes: sampleNodes,
  edges: sampleEdges,
  identities: [],
  activeIdentityId: null,
  memories: [],
  generatingNodeId: null,
  lastGenerationProvider: null,

  hydrate: () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        const { workspaceId, sessionId, isNewSession } =
          await db.ensureDefaultWorkspaceAndSession();

        const defaultIdentity = await db.ensureDefaultIdentity(workspaceId);
        const identities = await db.listIdentities(workspaceId);
        const memories = await db.listMemories(workspaceId);

        if (isNewSession) {
          for (const node of sampleNodes) {
            await db.insertNode(sessionId, node);
          }
          for (const edge of sampleEdges) {
            await db.insertEdge(sessionId, edge);
          }
          set({
            workspaceId,
            sessionId,
            nodes: sampleNodes,
            edges: sampleEdges,
            identities,
            activeIdentityId: defaultIdentity.id,
            memories,
          });
          return;
        }

        const { nodes, edges } = await db.loadSessionGraph(sessionId);
        set({
          workspaceId,
          sessionId,
          nodes,
          edges,
          identities,
          activeIdentityId: defaultIdentity.id,
          memories,
        });
      })();
    }
    return hydratePromise;
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });

    const sessionId = get().sessionId;
    if (!sessionId) return;

    for (const change of changes) {
      if (change.type === "remove") {
        db.deleteNode(change.id).catch((error: unknown) => {
          console.error(
            `Failed to delete node ${change.id} from database`,
            error,
          );
        });
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
            db.updateNodePosition(id, position).catch((error: unknown) => {
              console.error(
                `Failed to save position for node ${id} to database`,
                error,
              );
            });
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
        db.deleteEdge(change.id).catch((error: unknown) => {
          console.error(
            `Failed to delete edge ${change.id} from database`,
            error,
          );
        });
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
    }).catch((error: unknown) => {
      console.error(`Failed to save edge ${newEdge.id} to database`, error);
    });
  },

  addNode: (parentId, text) => {
    const id = crypto.randomUUID();
    const sessionId = get().sessionId;
    if (!sessionId) return id;

    const nodes = get().nodes;
    const edges = get().edges;

    let position: { x: number; y: number };
    if (parentId) {
      const parent = nodes.find((node) => node.id === parentId);
      const siblingCount = getChildIds(parentId, edges).length;
      position = parent
        ? {
            x: parent.position.x + siblingCount * 260,
            y: parent.position.y + 160,
          }
        : { x: 0, y: 0 };
    } else {
      const rootCount = nodes.filter(
        (node) => getParentId(node.id, edges) === null,
      ).length;
      position = { x: rootCount * 260, y: -160 };
    }

    const activeIdentity = get().identities.find(
      (identity) => identity.id === get().activeIdentityId,
    );

    const newNode: GraphNode = {
      id,
      type: "prompt",
      position,
      data: {
        text,
        identityName: activeIdentity?.name,
        identitySymbol: activeIdentity?.symbol,
      },
    };

    set({ nodes: [...nodes, newNode] });
    db.insertNode(sessionId, newNode).catch((error) =>
      console.error("Failed to persist new node", error),
    );

    if (parentId) {
      const newEdge: Edge = {
        id: crypto.randomUUID(),
        source: parentId,
        target: id,
      };
      set({ edges: [...get().edges, newEdge] });
      db.insertEdge(sessionId, newEdge).catch((error) =>
        console.error("Failed to persist new edge", error),
      );
    }

    return id;
  },

  updateNodeText: (nodeId, text) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, text } } : node,
      ),
    });
    db.updateNodeText(nodeId, text).catch((error) =>
      console.error("Failed to persist node text", error),
    );
  },

  deleteNodeWithDescendants: (nodeId) => {
    const edges = get().edges;
    const idsToRemove = new Set([nodeId, ...getDescendantIds(nodeId, edges)]);
    const edgesToRemove = edges.filter(
      (edge) => idsToRemove.has(edge.source) || idsToRemove.has(edge.target),
    );

    set({
      nodes: get().nodes.filter((node) => !idsToRemove.has(node.id)),
      edges: edges.filter(
        (edge) =>
          !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target),
      ),
    });

    for (const id of idsToRemove) {
      db.deleteNode(id).catch((error) =>
        console.error("Failed to delete node", error),
      );
    }
    for (const edge of edgesToRemove) {
      db.deleteEdge(edge.id).catch((error) =>
        console.error("Failed to delete edge", error),
      );
    }
  },

  deleteNodeAndReparentChildren: (nodeId) => {
    const edges = get().edges;
    const parentId = getParentId(nodeId, edges);
    const childIds = getChildIds(nodeId, edges);
    const edgesToRemove = edges.filter(
      (edge) => edge.source === nodeId || edge.target === nodeId,
    );
    const remainingEdges = edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    );
    const newEdges: Edge[] = parentId
      ? childIds.map((childId) => ({
          id: crypto.randomUUID(),
          source: parentId,
          target: childId,
        }))
      : [];

    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: [...remainingEdges, ...newEdges],
    });

    const sessionId = get().sessionId;
    db.deleteNode(nodeId).catch((error) =>
      console.error("Failed to delete node", error),
    );
    for (const edge of edgesToRemove) {
      db.deleteEdge(edge.id).catch((error) =>
        console.error("Failed to delete old edge", error),
      );
    }
    if (sessionId) {
      for (const edge of newEdges) {
        db.insertEdge(sessionId, edge).catch((error) =>
          console.error("Failed to persist reparented edge", error),
        );
      }
    }
  },

  generateResponse: async (promptNodeId) => {
    // ponytail: generatingNodeId is a single global slot (one Stop button,
    // no per-node concurrency in the UI) — refuse a second concurrent
    // generation rather than let it silently steal the module-level
    // abort controller out from under the first one.
    if (get().generatingNodeId !== null) return;

    const sessionId = get().sessionId;
    if (!sessionId) return;

    const responseNodeId = crypto.randomUUID();
    const promptNode = get().nodes.find((node) => node.id === promptNodeId);
    const position = promptNode
      ? { x: promptNode.position.x, y: promptNode.position.y + 160 }
      : { x: 0, y: 0 };

    const activeIdentity = get().identities.find(
      (identity) => identity.id === get().activeIdentityId,
    );
    const activeMemories = get()
      .memories.filter(
        (memory) =>
          memory.identityId === null ||
          memory.identityId === activeIdentity?.id,
      )
      .map((memory) => memory.content);

    const responseNode: GraphNode = {
      id: responseNodeId,
      type: "response",
      position,
      data: {
        text: "",
        identityName: activeIdentity?.name,
        identitySymbol: activeIdentity?.symbol,
      },
    };
    const responseEdge: Edge = {
      id: crypto.randomUUID(),
      source: promptNodeId,
      target: responseNodeId,
    };

    set({
      nodes: [...get().nodes, responseNode],
      edges: [...get().edges, responseEdge],
      generatingNodeId: responseNodeId,
    });
    db.insertNode(sessionId, responseNode).catch((error) =>
      console.error("Failed to persist new response node", error),
    );
    db.insertEdge(sessionId, responseEdge).catch((error) =>
      console.error("Failed to persist new response edge", error),
    );

    const abortController = new AbortController();
    activeAbortController = abortController;

    // get().nodes is typed Node<GraphNodeData>[] (xyflow's `type` is a bare
    // string) but every node the store ever creates is "prompt" or
    // "response" — narrow with a real type guard rather than casting so
    // buildBranchContext's GraphNode[] param stays honest.
    const context = buildBranchContext(
      promptNodeId,
      get().nodes.filter(
        (node): node is GraphNode =>
          node.type === "prompt" || node.type === "response",
      ),
      get().edges,
    );

    const onToken = (chunk: string) => {
      set({
        nodes: get().nodes.map((node) =>
          node.id === responseNodeId
            ? {
                ...node,
                data: { ...node.data, text: node.data.text + chunk },
              }
            : node,
        ),
      });

      if (streamPersistTimer) clearTimeout(streamPersistTimer);
      streamPersistTimer = setTimeout(() => {
        const currentText = get().nodes.find((n) => n.id === responseNodeId)
          ?.data.text;
        if (currentText !== undefined) {
          db.updateNodeText(responseNodeId, currentText).catch((error) =>
            console.error("Failed to persist streaming text", error),
          );
        }
        streamPersistTimer = null;
      }, TEXT_STREAM_PERSIST_DEBOUNCE_MS);
    };

    try {
      const isOllamaHealthy = await checkOllamaHealth();
      let providerUsed: "ollama" | "mock" = "mock";
      let result: ProviderResponse;

      if (isOllamaHealthy) {
        try {
          result = await generateOllamaResponse(context, {
            signal: abortController.signal,
            onToken,
            model: activeIdentity?.preferredModel ?? undefined,
            responseStyle: activeIdentity?.responseStyle ?? undefined,
            memories: activeMemories,
          });
          providerUsed = "ollama";
        } catch (error) {
          // A user-triggered abort must propagate exactly like the mock
          // provider's own aborts do — not get silently swapped for a mock
          // generation mid-cancellation. Only a genuine Ollama failure
          // (no models, HTTP error, etc.) falls back.
          //
          // Check our own controller's aborted state rather than sniffing
          // the rejection's identity/shape: @tauri-apps/plugin-http does
          // NOT reject with a DOMException on a real in-flight abort (it
          // throws/errors with a plain Error or bare string "Request
          // cancelled"), so matching on DOMException + "AbortError" here
          // silently misclassified a genuine user cancellation as an
          // Ollama failure and wiped the partial answer via the fallback
          // path below.
          if (abortController.signal.aborted) {
            throw error;
          }
          console.error(
            "Ollama generation failed, falling back to mock provider",
            error,
          );
          // Ollama may have already streamed partial text via onToken
          // before failing; clear it so the mock's own stream doesn't
          // visibly concatenate onto Ollama's leftover partial answer.
          set({
            nodes: get().nodes.map((node) =>
              node.id === responseNodeId
                ? { ...node, data: { ...node.data, text: "" } }
                : node,
            ),
          });
          result = await generateMockResponse(context, {
            signal: abortController.signal,
            onToken,
          });
          providerUsed = "mock";
        }
      } else {
        result = await generateMockResponse(context, {
          signal: abortController.signal,
          onToken,
        });
      }

      if (streamPersistTimer) {
        clearTimeout(streamPersistTimer);
        streamPersistTimer = null;
      }

      set({
        nodes: get().nodes.map((node) =>
          node.id === responseNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  text: result.answer,
                  suggestedBranches: result.suggestedBranches,
                },
              }
            : node,
        ),
        lastGenerationProvider: providerUsed,
      });
      db.updateNodeAnswer(
        responseNodeId,
        result.answer,
        result.suggestedBranches,
      ).catch((error) =>
        console.error("Failed to persist final response", error),
      );
    } catch (error) {
      console.error("Generation failed or was cancelled", error);
      // Cancellation (or any failure) leaves the debounced persist timer
      // dangling — clear it and flush whatever partial text is currently
      // in state immediately, rather than letting the stale timer fire
      // later and possibly race a subsequent generation's own timer.
      if (streamPersistTimer) {
        clearTimeout(streamPersistTimer);
        streamPersistTimer = null;
      }
      const partialText = get().nodes.find((node) => node.id === responseNodeId)
        ?.data.text;
      if (partialText !== undefined) {
        db.updateNodeText(responseNodeId, partialText).catch((flushError) =>
          console.error(
            "Failed to persist partial text after cancellation",
            flushError,
          ),
        );
      }
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      if (get().generatingNodeId === responseNodeId) {
        set({ generatingNodeId: null });
      }
    }
  },

  cancelGeneration: () => {
    activeAbortController?.abort();
  },

  setActiveIdentity: (id) => {
    set({ activeIdentityId: id });
  },

  createIdentity: (input) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return "";
    const identity: Identity = {
      id: crypto.randomUUID(),
      workspaceId,
      name: input.name,
      symbol: input.symbol,
      preferredModel: input.preferredModel,
      responseStyle: input.responseStyle,
    };
    set({ identities: [...get().identities, identity] });
    db.insertIdentity(identity).catch((error) =>
      console.error("Failed to persist new identity", error),
    );
    return identity.id;
  },

  updateIdentity: (id, updates) => {
    set({
      identities: get().identities.map((identity) =>
        identity.id === id ? { ...identity, ...updates } : identity,
      ),
    });
    db.updateIdentity(id, updates).catch((error) =>
      console.error("Failed to persist identity update", error),
    );
  },

  deleteIdentity: (id) => {
    const identities = get().identities;
    // ponytail: always keep at least one identity — a graph with zero
    // identities has no sane "active identity" for new nodes to snapshot.
    if (identities.length <= 1) return;
    const remaining = identities.filter((identity) => identity.id !== id);
    set({ identities: remaining });
    if (get().activeIdentityId === id) {
      set({ activeIdentityId: remaining[0].id });
    }
    set({
      memories: get().memories.map((memory) =>
        memory.identityId === id ? { ...memory, identityId: null } : memory,
      ),
    });
    db.reassignMemoriesToGlobal(id).catch((error) =>
      console.error("Failed to reassign memories to global scope", error),
    );
    db.deleteIdentity(id).catch((error) =>
      console.error("Failed to delete identity", error),
    );
  },

  createMemory: (input) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return "";
    const memory: Memory = {
      id: crypto.randomUUID(),
      workspaceId,
      identityId: input.identityId,
      content: input.content,
    };
    set({ memories: [...get().memories, memory] });
    db.insertMemory(memory).catch((error) =>
      console.error("Failed to persist new memory", error),
    );
    return memory.id;
  },

  updateMemory: (id, updates) => {
    set({
      memories: get().memories.map((memory) =>
        memory.id === id ? { ...memory, ...updates } : memory,
      ),
    });
    db.updateMemory(id, updates).catch((error) =>
      console.error("Failed to persist memory update", error),
    );
  },

  deleteMemory: (id) => {
    set({ memories: get().memories.filter((memory) => memory.id !== id) });
    db.deleteMemory(id).catch((error) =>
      console.error("Failed to delete memory", error),
    );
  },
}));
