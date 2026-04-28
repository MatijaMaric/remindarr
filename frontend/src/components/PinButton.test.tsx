import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import PinButton from "./PinButton";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";

const mockUser = {
  id: "user-1",
  username: "test",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "pinTitle").mockResolvedValue({ pinned: true } as any),
    spyOn(api, "unpinTitle").mockResolvedValue({ pinned: false } as any),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("PinButton", () => {
  it("renders 'Pin' when not pinned", () => {
    render(<PinButton titleId="movie-1" isPinned={false} />, { wrapper: Wrapper });
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Pin");
  });

  it("renders 'Pinned' when already pinned", () => {
    render(<PinButton titleId="movie-1" isPinned={true} />, { wrapper: Wrapper });
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Pinned");
  });

  it("returns null when user is not logged in", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    const { container } = render(
      <AuthContext value={noUserAuth as any}>
        <PinButton titleId="movie-1" />
      </AuthContext>
    );
    expect(container.innerHTML).toBe("");
  });

  it("calls api.pinTitle on click when not pinned", async () => {
    render(<PinButton titleId="movie-123" isPinned={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(api.pinTitle).toHaveBeenCalledWith("movie-123");
    });
  });

  it("calls api.unpinTitle on click when pinned", async () => {
    render(<PinButton titleId="movie-123" isPinned={true} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(api.unpinTitle).toHaveBeenCalledWith("movie-123");
    });
  });

  it("shows success toast after pinning", async () => {
    render(<PinButton titleId="movie-1" isPinned={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Added to pinned favorites");
    });
  });

  it("shows success toast after unpinning", async () => {
    render(<PinButton titleId="movie-1" isPinned={true} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Removed from pinned favorites");
    });
  });

  it("shows error toast when pin API fails with max 8 message", async () => {
    (api.pinTitle as any).mockRejectedValueOnce(new Error("Maximum of 8 pinned titles reached"));

    render(<PinButton titleId="movie-1" isPinned={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Maximum of 8 pinned titles reached");
    });
  });

  it("updates to 'Pinned' after pinning", async () => {
    render(<PinButton titleId="movie-1" isPinned={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.textContent).toContain("Pinned");
    });
  });

  it("updates to 'Pin' after unpinning", async () => {
    render(<PinButton titleId="movie-1" isPinned={true} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      const button = screen.getByRole("button");
      expect(button.textContent).toContain("Pin");
    });
  });
});
