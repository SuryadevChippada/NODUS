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
}));
