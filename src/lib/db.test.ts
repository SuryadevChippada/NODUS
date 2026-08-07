import { describe, it, expect, vi, beforeEach } from "vitest";

// ponytail: vi.mock factories only see vi.hoisted() bindings, not plain
// top-level const (those run after the mock factory in ESM eval order).
const { mockExecute, mockSelect, mockLoad } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
  const mockSelect = vi.fn().mockResolvedValue([]);
  const mockLoad = vi.fn().mockResolvedValue({
    execute: mockExecute,
    select: mockSelect,
  });
  return { mockExecute, mockSelect, mockLoad };
});

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: mockLoad },
}));

import {
  ensureDefaultWorkspaceAndSession,
  loadSessionGraph,
  insertNode,
  updateNodePosition,
  updateNodeText,
  updateNodeAnswer,
  deleteNode,
  insertEdge,
  deleteEdge,
} from "./db";

beforeEach(() => {
  mockExecute.mockClear();
  mockSelect.mockClear();
  mockLoad.mockClear();
  mockSelect.mockResolvedValue([]);
});

describe("ensureDefaultWorkspaceAndSession", () => {
  it("creates a workspace and session when none exist", async () => {
    mockSelect.mockResolvedValueOnce([]); // no existing session found
    const result = await ensureDefaultWorkspaceAndSession();
    expect(result.isNewSession).toBe(true);
    expect(result.workspaceId).toEqual(expect.any(String));
    expect(result.sessionId).toEqual(expect.any(String));
    // one INSERT for the workspace, one for the session
    const insertCalls = mockExecute.mock.calls.filter((c) =>
      String(c[0]).trim().toUpperCase().startsWith("INSERT"),
    );
    expect(insertCalls.length).toBe(2);
  });

  it("returns the existing session when one is found, without inserting", async () => {
    mockSelect.mockResolvedValueOnce([
      { id: "session-1", workspace_id: "workspace-1" },
    ]);
    const result = await ensureDefaultWorkspaceAndSession();
    expect(result).toEqual({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      isNewSession: false,
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("loadSessionGraph", () => {
  it("maps rows back into GraphNode/GraphEdge shape", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "prompt",
          text: "hello",
          position_x: 10,
          position_y: 20,
        },
      ])
      .mockResolvedValueOnce([
        { id: "e1", source_node_id: "n1", target_node_id: "n2" },
      ]);
    const { nodes, edges } = await loadSessionGraph("session-1");
    expect(nodes).toEqual([
      {
        id: "n1",
        type: "prompt",
        position: { x: 10, y: 20 },
        data: { text: "hello" },
      },
    ]);
    expect(edges).toEqual([{ id: "e1", source: "n1", target: "n2" }]);
  });
});

describe("write operations use parameterized SQL", () => {
  it("insertNode passes values as bind params, not string-interpolated", async () => {
    await insertNode("session-1", {
      id: "n1",
      type: "prompt",
      position: { x: 1, y: 2 },
      data: { text: "hi" },
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql).not.toContain("hi");
    expect(values).toContain("hi");
  });

  it("updateNodePosition updates only position columns for the given id", async () => {
    await updateNodePosition("n1", { x: 5, y: 6 });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(values).toEqual(expect.arrayContaining([5, 6, "n1"]));
  });

  it("deleteNode deletes by id", async () => {
    await deleteNode("n1");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["n1"]);
  });

  it("insertEdge and deleteEdge issue parameterized statements", async () => {
    await insertEdge("session-1", { id: "e1", source: "n1", target: "n2" });
    expect(mockExecute.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["e1", "session-1", "n1", "n2"]),
    );

    await deleteEdge("e1");
    const [sql, values] = mockExecute.mock.calls[1];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["e1"]);
  });
});

describe("updateNodeText", () => {
  it("updates only the text and updated_at columns for the given id", async () => {
    await updateNodeText("n1", "edited text");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(sql).not.toContain("edited text");
    expect(values).toEqual(expect.arrayContaining(["edited text", "n1"]));
  });
});

describe("updateNodeAnswer", () => {
  it("persists text and JSON-serialized suggested branches", async () => {
    await updateNodeAnswer("n1", "the answer", [{ label: "L", prompt: "P" }]);
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(values).toContain("the answer");
    expect(values).toContain(JSON.stringify([{ label: "L", prompt: "P" }]));
  });

  it("persists null suggested branches as SQL NULL, not the string 'null'", async () => {
    await updateNodeAnswer("n1", "the answer", null);
    const [, values] = mockExecute.mock.calls[0];
    expect(values).toContain(null);
    expect(values).not.toContain("null");
  });
});

describe("loadSessionGraph with suggested_branches", () => {
  it("parses a stored JSON suggested_branches column back into data.suggestedBranches", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "response",
          text: "answer",
          position_x: 0,
          position_y: 0,
          suggested_branches: JSON.stringify([{ label: "L", prompt: "P" }]),
        },
      ])
      .mockResolvedValueOnce([]);
    const { nodes } = await loadSessionGraph("session-1");
    expect(nodes[0].data.suggestedBranches).toEqual([
      { label: "L", prompt: "P" },
    ]);
  });

  it("leaves data.suggestedBranches undefined when the column is null", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "prompt",
          text: "question",
          position_x: 0,
          position_y: 0,
          suggested_branches: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const { nodes } = await loadSessionGraph("session-1");
    expect(nodes[0].data.suggestedBranches).toBeUndefined();
  });
});
