import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryPanel } from "./MemoryPanel";
import { useGraphStore } from "../store/graphStore";

vi.mock("../lib/db", () => ({
  insertMemory: vi.fn().mockResolvedValue(undefined),
  updateMemory: vi.fn().mockResolvedValue(undefined),
  deleteMemory: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useGraphStore.setState({
    workspaceId: "workspace-1",
    identities: [
      {
        id: "identity-1",
        workspaceId: "workspace-1",
        name: "Default",
        symbol: "❯",
        preferredModel: null,
        responseStyle: null,
      },
    ],
    activeIdentityId: "identity-1",
    memories: [],
  });
});

describe("MemoryPanel", () => {
  it("creates a global memory from the form", () => {
    render(<MemoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /memories/i }));
    fireEvent.change(screen.getByPlaceholderText(/remember something/i), {
      target: { value: "Prefers concise answers" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save memory/i }));

    expect(
      useGraphStore
        .getState()
        .memories.some((m) => m.content === "Prefers concise answers"),
    ).toBe(true);
  });

  it("lists existing memories with their scope", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: null,
          content: "Lives in Berlin",
        },
      ],
    });
    render(<MemoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /memories/i }));
    expect(screen.getByText(/lives in berlin/i)).toBeInTheDocument();
  });

  it("edits an existing memory via the panel instead of creating a new one", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: "identity-1",
          content: "Old content",
        },
      ],
    });
    render(<MemoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /memories/i }));
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByPlaceholderText(/remember something/i)).toHaveValue(
      "Old content",
    );
    expect(screen.getByRole("combobox")).toHaveValue("identity-1");

    fireEvent.change(screen.getByPlaceholderText(/remember something/i), {
      target: { value: "New content" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save memory/i }));

    const memories = useGraphStore.getState().memories;
    expect(memories).toHaveLength(1); // no duplicate created
    expect(memories[0].content).toBe("New content");
    expect(memories[0].identityId).toBe("identity-1");
  });

  it("does not write a deleted identity's id back onto a memory from a stale edit draft", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: "identity-1",
          content: "Scoped to identity-1",
        },
      ],
    });
    render(<MemoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /memories/i }));
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    // The identity this draft was scoped to is deleted out from under the
    // open edit form (e.g. via IdentityBar, rendered alongside this panel).
    // The store correctly reassigns the memory to global scope...
    act(() => {
      useGraphStore.setState({
        identities: [],
        memories: [
          {
            id: "memory-1",
            workspaceId: "workspace-1",
            identityId: null,
            content: "Scoped to identity-1",
          },
        ],
      });
    });

    // ...but the form's draftIdentityId still holds the now-dead id. Saving
    // must not resurrect it.
    fireEvent.click(screen.getByRole("button", { name: /save memory/i }));

    expect(
      useGraphStore.getState().memories.find((m) => m.id === "memory-1")
        ?.identityId,
    ).toBeNull();
  });

  it("deletes a memory", () => {
    useGraphStore.setState({
      memories: [
        {
          id: "memory-1",
          workspaceId: "workspace-1",
          identityId: null,
          content: "To be deleted",
        },
      ],
    });
    render(<MemoryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /memories/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(useGraphStore.getState().memories).toHaveLength(0);
  });
});
