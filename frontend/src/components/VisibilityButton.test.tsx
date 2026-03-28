import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import VisibilityButton from "./VisibilityButton";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";

const mockUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthContext value={mockAuthValue as any}>{children}</AuthContext>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "updateTitleVisibility").mockResolvedValue(undefined as any),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("VisibilityButton", () => {
  it("returns null when user is not logged in", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    const { container } = render(
      <AuthContext value={noUserAuth as any}>
        <VisibilityButton titleId="123" isPublic={true} isTracked={true} />
      </AuthContext>
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when title is not tracked", () => {
    const { container } = render(
      <VisibilityButton titleId="123" isPublic={true} isTracked={false} />,
      { wrapper: Wrapper }
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders 'Public' when isPublic is true (button variant)", () => {
    render(
      <VisibilityButton titleId="123" isPublic={true} isTracked={true} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Public")).toBeDefined();
  });

  it("renders 'Hidden' when isPublic is false (button variant)", () => {
    render(
      <VisibilityButton titleId="123" isPublic={false} isTracked={true} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Hidden")).toBeDefined();
  });

  it("toggles from public to hidden on click", async () => {
    const onToggle = mock(() => {});
    render(
      <VisibilityButton titleId="123" isPublic={true} isTracked={true} onToggle={onToggle} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Hidden")).toBeDefined();
    });

    expect(api.updateTitleVisibility).toHaveBeenCalledWith("123", false);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(sonner.toast.success).toHaveBeenCalledWith("Hidden from profile");
  });

  it("toggles from hidden to public on click", async () => {
    const onToggle = mock(() => {});
    render(
      <VisibilityButton titleId="456" isPublic={false} isTracked={true} onToggle={onToggle} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Public")).toBeDefined();
    });

    expect(api.updateTitleVisibility).toHaveBeenCalledWith("456", true);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(sonner.toast.success).toHaveBeenCalledWith("Visible on profile");
  });

  it("shows error toast on failure", async () => {
    (api.updateTitleVisibility as any).mockRejectedValueOnce(new Error("fail"));

    render(
      <VisibilityButton titleId="123" isPublic={true} isTracked={true} />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update visibility");
    });
  });

  it("renders overlay variant", () => {
    render(
      <VisibilityButton titleId="123" isPublic={true} isTracked={true} variant="overlay" />,
      { wrapper: Wrapper }
    );

    const button = screen.getByRole("button");
    expect(button.className).toContain("absolute");
  });
});
