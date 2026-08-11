import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IdentityBar } from "./IdentityBar";
import { useGraphStore } from "../store/graphStore";

vi.mock("../lib/db", () => ({
  insertIdentity: vi.fn().mockResolvedValue(undefined),
  updateIdentity: vi.fn().mockResolvedValue(undefined),
  deleteIdentity: vi.fn().mockResolvedValue(undefined),
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
  });
});

describe("IdentityBar", () => {
  it("shows the active identity in the switcher", () => {
    render(<IdentityBar />);
    expect(screen.getByRole("combobox")).toHaveValue("identity-1");
  });

  it("switches the active identity when a different option is selected", () => {
    useGraphStore.setState({
      identities: [
        ...useGraphStore.getState().identities,
        {
          id: "identity-2",
          workspaceId: "workspace-1",
          name: "Second",
          symbol: "S",
          preferredModel: null,
          responseStyle: null,
        },
      ],
    });
    render(<IdentityBar />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "identity-2" },
    });
    expect(useGraphStore.getState().activeIdentityId).toBe("identity-2");
  });

  it("creates a new identity from the manage panel", () => {
    render(<IdentityBar />);
    fireEvent.click(screen.getByRole("button", { name: /manage identities/i }));
    fireEvent.change(screen.getByPlaceholderText(/^name$/i), {
      target: { value: "Researcher" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^symbol$/i), {
      target: { value: "R" },
    });
    fireEvent.click(screen.getByRole("button", { name: /\+ new identity/i }));
    expect(
      useGraphStore.getState().identities.some((i) => i.name === "Researcher"),
    ).toBe(true);
  });

  it("disables Delete for the only remaining identity", () => {
    render(<IdentityBar />);
    fireEvent.click(screen.getByRole("button", { name: /manage identities/i }));
    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
  });
});
