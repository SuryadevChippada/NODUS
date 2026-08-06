import { describe, it, expect } from "vitest";
import { sampleNodes, sampleEdges } from "./sampleGraph";
import { graphNodeSchema, graphEdgeSchema } from "../types/graph";

describe("sample graph data", () => {
  it("has at least one prompt node and one response node", () => {
    const types = sampleNodes.map((n) => n.type);
    expect(types).toContain("prompt");
    expect(types).toContain("response");
  });

  it("every node passes the graph node schema", () => {
    for (const node of sampleNodes) {
      expect(() => graphNodeSchema.parse(node)).not.toThrow();
    }
  });

  it("every edge passes the graph edge schema", () => {
    for (const edge of sampleEdges) {
      expect(() => graphEdgeSchema.parse(edge)).not.toThrow();
    }
  });

  it("every edge references node ids that exist", () => {
    const ids = new Set(sampleNodes.map((n) => n.id));
    for (const edge of sampleEdges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("has no duplicate node ids", () => {
    const ids = sampleNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
