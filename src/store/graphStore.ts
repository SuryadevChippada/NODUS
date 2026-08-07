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
import * as db from "../lib/db";
import {
  getChildIds,
  getParentId,
  getDescendantIds,
} from "../lib/graphTraversal";

const POSITION_SAVE_DEBOUNCE_MS = 400;
const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  hydrate: () => Promise<void>;
  onNodesChange: (changes: NodeChange<Node<GraphNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (parentId: string | null, text: string) => void;
  updateNodeText: (nodeId: string, text: string) => void;
  deleteNodeWithDescendants: (nodeId: string) => void;
  deleteNodeAndReparentChildren: (nodeId: string) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  sessionId: null,
  nodes: sampleNodes,
  edges: sampleEdges,

  hydrate: () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        const { sessionId, isNewSession } =
          await db.ensureDefaultWorkspaceAndSession();

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
    const sessionId = get().sessionId;
    if (!sessionId) return;

    const id = crypto.randomUUID();
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

    const newNode: GraphNode = {
      id,
      type: "prompt",
      position,
      data: { text },
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
  },

  updateNodeText: (nodeId, text) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { text } } : node,
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
}));
