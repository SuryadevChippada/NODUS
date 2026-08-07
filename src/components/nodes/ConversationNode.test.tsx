import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationNode } from "./ConversationNode";

// ConversationNode's Handle and NodeToolbar (from @xyflow/react) both read
// from React Flow's internal store via context, which only exists inside a
// real <ReactFlow> instance. Rendering the node standalone (no provider, no
// nodeLookup entry for "n1") makes both throw/no-op — so, same rationale as
// the store mock below, stub them out to isolate ConversationNode from real
// React Flow internals rather than trying to stand up a full canvas here.
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Handle: () => null,
    NodeToolbar: ({ children }: { children?: ReactNode }) => <>{children}</>,
  };
});

const mockAddNode = vi.fn();
const mockUpdateNodeText = vi.fn();
const mockDeleteWithDescendants = vi.fn();
const mockDeleteAndReparent = vi.fn();

vi.mock("../../store/graphStore", () => ({
  useGraphStore: (selector: (state: unknown) => unknown) =>
    selector({
      addNode: mockAddNode,
      updateNodeText: mockUpdateNodeText,
      deleteNodeWithDescendants: mockDeleteWithDescendants,
      deleteNodeAndReparentChildren: mockDeleteAndReparent,
      edges: [{ id: "e1", source: "n1", target: "child1" }],
    }),
}));

const baseProps = {
  id: "n1",
  data: { text: "hello world" },
  selected: true,
  isConnectable: true,
  zIndex: 0,
  dragging: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  type: "prompt" as const,
  label: "❯ prompt",
  borderClass: "border-cyan-500/40",
  labelClass: "text-cyan-400",
} as unknown as Parameters<typeof ConversationNode>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("ConversationNode", () => {
  it("renders the node text", () => {
    render(<ConversationNode {...baseProps} />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("calls addNode with this node's id on Branch click", () => {
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /branch/i }));
    expect(mockAddNode).toHaveBeenCalledWith("n1", expect.any(String));
  });

  it("switches to an editable textarea on Edit click and saves on blur", () => {
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "edited text" } });
    fireEvent.blur(textarea);
    expect(mockUpdateNodeText).toHaveBeenCalledWith("n1", "edited text");
  });

  it("copies the node text on Copy click", () => {
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello world");
  });

  it("cascade-deletes when the user confirms both prompts", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(mockDeleteWithDescendants).toHaveBeenCalledWith("n1");
    expect(mockDeleteAndReparent).not.toHaveBeenCalled();
  });

  it("reparents when the user declines the cascade prompt", () => {
    let call = 0;
    vi.spyOn(window, "confirm").mockImplementation(() => {
      call += 1;
      return call === 1; // confirm deletion, decline cascade
    });
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(mockDeleteAndReparent).toHaveBeenCalledWith("n1");
    expect(mockDeleteWithDescendants).not.toHaveBeenCalled();
  });

  it("does nothing when the user cancels the first delete prompt", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ConversationNode {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(mockDeleteWithDescendants).not.toHaveBeenCalled();
    expect(mockDeleteAndReparent).not.toHaveBeenCalled();
  });
});
