import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import TrackButton from "./TrackButton";
import * as api from "../api";
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

  it("calls untrackTitle and updates to 'Track' on click", async () => {
    const onToggle = mock(() => {});
    render(<TrackButton titleId="456" isTracked={true} onToggle={onToggle} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Tracked" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
    });

    expect(api.untrackTitle).toHaveBeenCalledWith("456");
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("has aria-pressed=false when not tracked", () => {
    render(<TrackButton titleId="123" isTracked={false} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Track" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("has aria-pressed=true when tracked", () => {
    render(<TrackButton titleId="123" isTracked={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Tracked" }).getAttribute("aria-pressed")).toBe("true");
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
});
