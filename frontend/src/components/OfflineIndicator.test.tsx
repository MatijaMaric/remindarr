import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, act, cleanup } from "@testing-library/react";
import OfflineIndicator from "./OfflineIndicator";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe("OfflineIndicator", () => {
  it("explains that private data and writes need a connection", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole("status").textContent).toContain(
      "changes are not saved offline",
    );
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain(
      "reconnect and try again",
    );
  });
});
