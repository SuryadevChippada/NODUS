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

  hydrate: async () => {
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
  },

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });

    const sessionId = get().sessionId;
    if (!sessionId) return;

    for (const change of changes) {
      if (change.type === "remove") {
        db.deleteNode(change.id);
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
            db.updateNodePosition(id, position);
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
        db.deleteEdge(change.id);
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
    });
  },
}));
