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
  ensureDefaultIdentity,
  listIdentities,
  insertIdentity,
  updateIdentity,
  deleteIdentity,
  listMemories,
  insertMemory,
  updateMemory,
  deleteMemory,
  reassignMemoriesToGlobal,
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

describe("ensureDefaultIdentity", () => {
  it("creates a Default identity when none exist for the workspace", async () => {
    mockSelect.mockResolvedValueOnce([]); // no existing identity found
    const identity = await ensureDefaultIdentity("workspace-1");
    expect(identity.name).toBe("Default");
    expect(identity.symbol).toBe("❯");
    expect(identity.workspaceId).toBe("workspace-1");
    expect(identity.preferredModel).toBeNull();
    expect(identity.responseStyle).toBeNull();
    const insertCalls = mockExecute.mock.calls.filter((c) =>
      String(c[0]).trim().toUpperCase().startsWith("INSERT"),
    );
    expect(insertCalls.length).toBe(1);
  });

  it("returns the existing identity when one is found, without inserting", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "identity-1",
        workspace_id: "workspace-1",
        name: "Researcher",
        symbol: "R",
        preferred_model: "llama3.1:latest",
        response_style: "concise",
      },
    ]);
    const identity = await ensureDefaultIdentity("workspace-1");
    expect(identity).toEqual({
      id: "identity-1",
      workspaceId: "workspace-1",
      name: "Researcher",
      symbol: "R",
      preferredModel: "llama3.1:latest",
      responseStyle: "concise",
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("listIdentities", () => {
  it("maps rows into Identity shape", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "identity-1",
        workspace_id: "workspace-1",
        name: "Default",
        symbol: "❯",
        preferred_model: null,
        response_style: null,
      },
    ]);
    const identities = await listIdentities("workspace-1");
    expect(identities).toEqual([
      {
        id: "identity-1",
        workspaceId: "workspace-1",
        name: "Default",
        symbol: "❯",
        preferredModel: null,
        responseStyle: null,
      },
    ]);
  });
});

describe("identity write operations use parameterized SQL", () => {
  it("insertIdentity passes values as bind params, not string-interpolated", async () => {
    await insertIdentity({
      id: "identity-1",
      workspaceId: "workspace-1",
      name: "Researcher",
      symbol: "R",
      preferredModel: null,
      responseStyle: null,
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql).not.toContain("Researcher");
    expect(values).toContain("Researcher");
  });

  it("updateIdentity updates the given identity's editable columns", async () => {
    await updateIdentity("identity-1", {
      name: "Renamed",
      symbol: "X",
      preferredModel: "qwen2:7b",
      responseStyle: "detailed",
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(values).toEqual(
      expect.arrayContaining([
        "Renamed",
        "X",
        "qwen2:7b",
        "detailed",
        "identity-1",
      ]),
    );
  });

  it("deleteIdentity deletes by id", async () => {
    await deleteIdentity("identity-1");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["identity-1"]);
  });
});

describe("insertNode with identity snapshot", () => {
  it("persists identityName/identitySymbol as identity_name/identity_symbol columns", async () => {
    await insertNode("session-1", {
      id: "n1",
      type: "prompt",
      position: { x: 0, y: 0 },
      data: { text: "hi", identityName: "Researcher", identitySymbol: "R" },
    });
    const [, values] = mockExecute.mock.calls[0];
    expect(values).toEqual(expect.arrayContaining(["Researcher", "R"]));
  });

  it("persists null identity columns when no identity snapshot is present", async () => {
    await insertNode("session-1", {
      id: "n1",
      type: "prompt",
      position: { x: 0, y: 0 },
      data: { text: "hi" },
    });
    const [, values] = mockExecute.mock.calls[0];
    expect(values).toContain(null);
  });
});

describe("loadSessionGraph with identity snapshot", () => {
  it("maps identity_name/identity_symbol columns back into data.identityName/identitySymbol", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "prompt",
          text: "hello",
          position_x: 0,
          position_y: 0,
          identity_name: "Researcher",
          identity_symbol: "R",
        },
      ])
      .mockResolvedValueOnce([]);
    const { nodes } = await loadSessionGraph("session-1");
    expect(nodes[0].data.identityName).toBe("Researcher");
    expect(nodes[0].data.identitySymbol).toBe("R");
  });

  it("leaves identityName/identitySymbol undefined when the columns are null", async () => {
    mockSelect
      .mockResolvedValueOnce([
        {
          id: "n1",
          type: "prompt",
          text: "hello",
          position_x: 0,
          position_y: 0,
          identity_name: null,
          identity_symbol: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const { nodes } = await loadSessionGraph("session-1");
    expect(nodes[0].data.identityName).toBeUndefined();
    expect(nodes[0].data.identitySymbol).toBeUndefined();
  });
});

describe("listMemories", () => {
  it("maps rows into Memory shape", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "memory-1",
        workspace_id: "workspace-1",
        identity_id: null,
        content: "User prefers concise answers",
      },
    ]);
    const memories = await listMemories("workspace-1");
    expect(memories).toEqual([
      {
        id: "memory-1",
        workspaceId: "workspace-1",
        identityId: null,
        content: "User prefers concise answers",
      },
    ]);
  });

  it("maps a non-null identity_id through as identityId", async () => {
    mockSelect.mockResolvedValueOnce([
      {
        id: "memory-1",
        workspace_id: "workspace-1",
        identity_id: "identity-1",
        content: "Prefers Python over JavaScript",
      },
    ]);
    const memories = await listMemories("workspace-1");
    expect(memories[0].identityId).toBe("identity-1");
  });
});

describe("memory write operations use parameterized SQL", () => {
  it("insertMemory passes values as bind params, not string-interpolated", async () => {
    await insertMemory({
      id: "memory-1",
      workspaceId: "workspace-1",
      identityId: null,
      content: "Lives in Berlin",
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql).not.toContain("Berlin");
    expect(values).toContain("Lives in Berlin");
  });

  it("updateMemory updates content and identity scope for the given id", async () => {
    await updateMemory("memory-1", {
      content: "Lives in Munich now",
      identityId: "identity-2",
    });
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(values).toEqual(
      expect.arrayContaining(["Lives in Munich now", "identity-2", "memory-1"]),
    );
  });

  it("deleteMemory deletes by id", async () => {
    await deleteMemory("memory-1");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("DELETE");
    expect(values).toEqual(["memory-1"]);
  });

  it("reassignMemoriesToGlobal sets identity_id to NULL for every memory owned by that identity", async () => {
    await reassignMemoriesToGlobal("identity-1");
    const [sql, values] = mockExecute.mock.calls[0];
    expect(sql.toUpperCase()).toContain("UPDATE");
    expect(sql).toContain("identity_id");
    expect(values).toEqual(["identity-1"]);
  });
});
