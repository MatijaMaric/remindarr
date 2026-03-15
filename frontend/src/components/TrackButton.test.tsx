import { describe, it, expect, mock, afterEach } from "bun:test";

// Mock the api module before importing the component
mock.module("../api", () => ({
  trackTitle: mock(() => Promise.resolve()),
  untrackTitle: mock(() => Promise.resolve()),
}));

// Mock useAuth to return a logged-in user by default
const mockUseAuth = mock(() => ({
  user: { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false },
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
}));

mock.module("../context/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import TrackButton from "./TrackButton";
import * as api from "../api";

afterEach(() => {
  cleanup();
});

describe("TrackButton", () => {
  it("renders 'Track' when not tracked", () => {
    render(<TrackButton titleId="123" isTracked={false} />);
    expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
  });

  it("renders 'Tracked' when tracked", () => {
    render(<TrackButton titleId="123" isTracked={true} />);
    expect(screen.getByRole("button", { name: "Tracked" })).toBeDefined();
  });

  it("returns null when user is not logged in", () => {
    mockUseAuth.mockReturnValueOnce({
      user: null,
      providers: null,
      loading: false,
      login: mock(() => Promise.resolve()),
      logout: mock(() => Promise.resolve()),
      refresh: mock(() => Promise.resolve()),
    });

    const { container } = render(<TrackButton titleId="123" isTracked={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls trackTitle and updates to 'Tracked' on click", async () => {
    const onToggle = mock(() => {});
    render(<TrackButton titleId="123" isTracked={false} onToggle={onToggle} />);

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
    render(<TrackButton titleId="456" isTracked={true} onToggle={onToggle} />);

    const button = screen.getByRole("button", { name: "Tracked" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Track" })).toBeDefined();
    });

    expect(api.untrackTitle).toHaveBeenCalledWith("456");
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows loading indicator while toggling", async () => {
    // Make trackTitle hang to observe loading state
    let resolveTrack: () => void;
    (api.trackTitle as ReturnType<typeof mock>).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveTrack = resolve; })
    );

    render(<TrackButton titleId="789" isTracked={false} />);

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
