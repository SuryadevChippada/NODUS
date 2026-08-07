import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock the persistence layer itself (not the store) so the real
// useGraphStore.hydrate() runs and its .catch() path in App.tsx is
// exercised end-to-end.
vi.mock("./lib/db", () => ({
  ensureDefaultWorkspaceAndSession: vi
    .fn()
    .mockRejectedValue(new Error("disk full")),
  loadSessionGraph: vi.fn(),
  insertNode: vi.fn(),
  updateNodePosition: vi.fn(),
  deleteNode: vi.fn(),
  insertEdge: vi.fn(),
  deleteEdge: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows a visible error instead of hanging on the loading screen when hydrate() rejects", async () => {
    render(<App />);

    expect(
      await screen.findByText(/failed to load workspace/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/disk full/i)).toBeInTheDocument();
  });
});
