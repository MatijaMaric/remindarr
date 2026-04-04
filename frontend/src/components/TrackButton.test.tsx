import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { ReactNode } from "react";
// Initialize i18n before anything else
import "../i18n";
import TrackButton from "./TrackButton";
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

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "trackTitle").mockResolvedValue(undefined as any),
    spyOn(api, "untrackTitle").mockResolvedValue(undefined as any),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("TrackButton", () => {
  it("renders 'Track' when not tracked", () => {
    render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
  });

  it("renders 'Tracked' when tracked", () => {
    render(<TrackButton titleId="123" isTracked={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
  });

  it("returns null when user is not logged in", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    const { container } = render(
      <AuthContext value={noUserAuth as any}>
        <TrackButton titleId="123" isTracked={false} />
      </AuthContext>
    );
    expect(container.innerHTML).toBe("");
  });

  it("calls trackTitle and updates to 'Tracked' on click", async () => {
    const onToggle = mock(() => {});
    render(<TrackButton titleId="123" isTracked={false} onToggle={onToggle} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Track" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
    });

    expect(api.trackTitle).toHaveBeenCalledWith("123", undefined, undefined);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("has aria-pressed=false when not tracked", () => {
    render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Track" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("has aria-pressed=true when tracked", () => {
    render(<TrackButton titleId="123" isTracked={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Tracked" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows success toast when tracking a title", async () => {
    render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Title tracked");
    });
  });

  it("shows error toast when tracking fails", async () => {
    (api.trackTitle as any).mockRejectedValueOnce(new Error("Network error"));

    render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to track — please try again");
    });
  });

  it("shows loading indicator while toggling", async () => {
    // Make trackTitle hang to observe loading state
    let resolveTrack: () => void;
    (api.trackTitle as any).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveTrack = resolve; })
    );

    render(<TrackButton titleId="789" isTracked={false} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Track" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "..." })).toBeDefined();
    });

    // Button should be disabled while loading
    expect(screen.getByRole("button", { name: "..." }).hasAttribute("disabled")).toBe(true);

    resolveTrack!();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
    });
  });

  describe("untrack confirmation dialog", () => {
    it("shows confirmation dialog when clicking untrack", async () => {
      render(
        <TrackButton
          titleId="456"
          isTracked={true}
          titleData={{ title: "Breaking Bad" } as any}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Breaking Bad?")).toBeDefined();
      });

      // untrackTitle should NOT have been called yet
      expect(api.untrackTitle).not.toHaveBeenCalled();
    });

    it("does not untrack when cancel is clicked", async () => {
      render(
        <TrackButton
          titleId="456"
          isTracked={true}
          titleData={{ title: "Breaking Bad" } as any}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Breaking Bad?")).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Stop tracking Breaking Bad?")).toBeNull();
      });

      // untrackTitle should not have been called
      expect(api.untrackTitle).not.toHaveBeenCalled();

      // Button should still show "Tracked"
      expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
    });

    it("proceeds with untrack when confirm is clicked", async () => {
      const onToggle = mock(() => {});
      render(
        <TrackButton
          titleId="456"
          isTracked={true}
          onToggle={onToggle}
          titleData={{ title: "Breaking Bad" } as any}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Breaking Bad?")).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
      });

      expect(api.untrackTitle).toHaveBeenCalledWith("456");
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it("shows success toast after confirming untrack", async () => {
      render(
        <TrackButton
          titleId="456"
          isTracked={true}
          titleData={{ title: "Breaking Bad" } as any}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Breaking Bad?")).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => {
        expect(sonner.toast.success).toHaveBeenCalledWith("Removed from tracked");
      });
    });

    it("shows error toast when untrack fails after confirmation", async () => {
      (api.untrackTitle as any).mockRejectedValueOnce(new Error("Network error"));

      render(
        <TrackButton
          titleId="456"
          isTracked={true}
          titleData={{ title: "Breaking Bad" } as any}
        />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Breaking Bad?")).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => {
        expect(sonner.toast.error).toHaveBeenCalledWith("Failed to untrack — please try again");
      });
    });

    it("uses fallback title in dialog when titleData is not provided", async () => {
      render(
        <TrackButton titleId="456" isTracked={true} />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: "Tracked" }));

      await waitFor(() => {
        expect(screen.getByText("Stop tracking Track?")).toBeDefined();
      });
    });

    it("does not show confirmation dialog when tracking", () => {
      render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });

      fireEvent.click(screen.getByRole("button", { name: "Track" }));

      // No dialog should appear
      expect(screen.queryByText(/Stop tracking/)).toBeNull();
    });
  });

  describe("prop sync via useEffect", () => {
    it("reflects updated isTracked=true prop without user interaction", async () => {
      const { rerender } = render(
        <Wrapper>
          <TrackButton titleId="sync-1" isTracked={false} />
        </Wrapper>,
      );

      expect(screen.getByRole("button", { name: "Track" })).toBeDefined();

      await act(async () => {
        rerender(
          <Wrapper>
            <TrackButton titleId="sync-1" isTracked={true} />
          </Wrapper>,
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
      });
    });

    it("reflects updated isTracked=false prop without user interaction", async () => {
      const { rerender } = render(
        <Wrapper>
          <TrackButton titleId="sync-2" isTracked={true} />
        </Wrapper>,
      );

      expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();

      await act(async () => {
        rerender(
          <Wrapper>
            <TrackButton titleId="sync-2" isTracked={false} />
          </Wrapper>,
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
      });
    });
  });
});
