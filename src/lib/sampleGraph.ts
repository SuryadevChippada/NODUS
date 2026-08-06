import type { GraphNode, GraphEdge } from "../types/graph";

export const sampleNodes: GraphNode[] = [
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 0, y: 0 },
    data: { text: "What is the capital of France?" },
  },
  {
    id: "response-1",
    type: "response",
    position: { x: 0, y: 160 },
    data: { text: "The capital of France is Paris." },
  },
  {
    id: "prompt-2",
    type: "prompt",
    position: { x: -220, y: 320 },
    data: { text: "What is its population?" },
  },
  {
    id: "prompt-3",
    type: "prompt",
    position: { x: 220, y: 320 },
    data: { text: "What are must-see landmarks?" },
  },
  {
    id: "response-2",
    type: "response",
    position: { x: 220, y: 480 },
    data: {
      text: "The Eiffel Tower, the Louvre, and Notre-Dame are the most visited landmarks.",
    },
  },
];

export const sampleEdges: GraphEdge[] = [
  { id: "e-prompt-1-response-1", source: "prompt-1", target: "response-1" },
  { id: "e-response-1-prompt-2", source: "response-1", target: "prompt-2" },
  { id: "e-response-1-prompt-3", source: "response-1", target: "prompt-3" },
  { id: "e-prompt-3-response-2", source: "prompt-3", target: "response-2" },
];
