import { describe, it, expect } from "vitest";
import { buildBranchContext } from "./branchContext";
import type { GraphNode, GraphEdge } from "../types/graph";

function node(
  id: string,
  type: "prompt" | "response",
  text: string,
): GraphNode {
  return { id, type, position: { x: 0, y: 0 }, data: { text } };
}

// Tree used by most tests below:
//   root(prompt) -> mid(response) -> leaf(prompt)
//                -> sibling(prompt)
const nodes: GraphNode[] = [
  node("root", "prompt", "root question"),
  node("mid", "response", "root answer"),
  node("leaf", "prompt", "follow-up question"),
  node("sibling", "prompt", "unrelated follow-up"),
];
const edges: GraphEdge[] = [
  { id: "e1", source: "root", target: "mid" },
  { id: "e2", source: "mid", target: "leaf" },
  { id: "e3", source: "mid", target: "sibling" },
];

describe("buildBranchContext", () => {
  it("returns the ancestor chain in chronological order, including the selected node", () => {
    const result = buildBranchContext("leaf", nodes, edges);
    expect(result.map((m) => m.nodeId)).toEqual(["root", "mid", "leaf"]);
    expect(result[0]).toEqual({
      nodeId: "root",
      role: "prompt",
      text: "root question",
    });
    expect(result[2]).toEqual({
      nodeId: "leaf",
      role: "prompt",
      text: "follow-up question",
    });
  });

  it("excludes sibling branches", () => {
    const result = buildBranchContext("leaf", nodes, edges);
    expect(result.map((m) => m.nodeId)).not.toContain("sibling");
  });

  it("returns just the node itself when it has no parent", () => {
    const result = buildBranchContext("root", nodes, edges);
    expect(result).toEqual([
      { nodeId: "root", role: "prompt", text: "root question" },
    ]);
  });

  it("returns an empty array for a node id that doesn't exist", () => {
    expect(buildBranchContext("does-not-exist", nodes, edges)).toEqual([]);
  });

  it("stops safely at a dangling parent reference instead of throwing", () => {
    const danglingEdges: GraphEdge[] = [
      { id: "e1", source: "ghost", target: "leaf" },
    ];
    const result = buildBranchContext("leaf", nodes, danglingEdges);
    expect(result).toEqual([
      { nodeId: "leaf", role: "prompt", text: "follow-up question" },
    ]);
  });

  it("does not infinite-loop on a cyclic edge list", () => {
    const cyclicEdges: GraphEdge[] = [
      { id: "e1", source: "mid", target: "leaf" },
      { id: "e2", source: "leaf", target: "mid" },
    ];
    const result = buildBranchContext("leaf", nodes, cyclicEdges);
    expect(result.map((m) => m.nodeId)).toEqual(["mid", "leaf"]);
  });

  it("keeps only the most recent messages when maxMessages truncates the chain", () => {
    const result = buildBranchContext("leaf", nodes, edges, { maxMessages: 2 });
    expect(result.map((m) => m.nodeId)).toEqual(["mid", "leaf"]);
  });

  it("returns the full chain unchanged when maxMessages is larger than the chain", () => {
    const result = buildBranchContext("leaf", nodes, edges, {
      maxMessages: 10,
    });
    expect(result.map((m) => m.nodeId)).toEqual(["root", "mid", "leaf"]);
  });

  it("returns an empty array when maxMessages is 0", () => {
    const result = buildBranchContext("leaf", nodes, edges, {
      maxMessages: 0,
    });
    expect(result).toEqual([]);
  });
});
