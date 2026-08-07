import { describe, it, expect } from "vitest";
import { getChildIds, getParentId, getDescendantIds } from "./graphTraversal";
import type { GraphEdge } from "../types/graph";

// Tree shape used by every test below:
//   a
//  / \
// b   d
// |
// c
const edges: GraphEdge[] = [
  { id: "e1", source: "a", target: "b" },
  { id: "e2", source: "a", target: "d" },
  { id: "e3", source: "b", target: "c" },
];

describe("getChildIds", () => {
  it("returns direct children only", () => {
    expect(getChildIds("a", edges).sort()).toEqual(["b", "d"]);
    expect(getChildIds("b", edges)).toEqual(["c"]);
    expect(getChildIds("c", edges)).toEqual([]);
  });
});

describe("getParentId", () => {
  it("returns the parent id", () => {
    expect(getParentId("b", edges)).toBe("a");
    expect(getParentId("c", edges)).toBe("b");
  });

  it("returns null for a root node", () => {
    expect(getParentId("a", edges)).toBeNull();
  });

  it("returns null for a node with no edges at all", () => {
    expect(getParentId("z", edges)).toBeNull();
  });
});

describe("getDescendantIds", () => {
  it("returns all descendants, not just direct children", () => {
    expect(getDescendantIds("a", edges).sort()).toEqual(["b", "c", "d"]);
  });

  it("returns an empty array for a leaf node", () => {
    expect(getDescendantIds("c", edges)).toEqual([]);
    expect(getDescendantIds("d", edges)).toEqual([]);
  });

  it("does not infinite-loop on a self-referencing or cyclic edge list", () => {
    const cyclic: GraphEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "a" },
    ];
    const result = getDescendantIds("a", cyclic);
    expect(result).toEqual(["b"]);
  });
});
