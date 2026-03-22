import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, act, cleanup } from "@testing-library/react";
import OfflineIndicator from "./OfflineIndicator";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    get: () => value,
    configurable: true,
  });
}

beforeEach(() => {
  setOnline(true);
});

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("OfflineIndicator", () => {
  it("renders nothing when online", () => {
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows banner when initially offline", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/You're offline/)).toBeDefined();
  });

  it("shows banner when offline event fires", () => {
    render(<OfflineIndicator />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/You're offline/)).toBeDefined();
  });

  it("hides banner when online event fires after going offline", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/You're offline/)).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByText(/You're offline/)).toBeNull();
  });
});
