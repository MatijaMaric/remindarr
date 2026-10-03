import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, act, cleanup } from "@testing-library/react";
import OfflineIndicator from "./OfflineIndicator";
import "../i18n";
import { AuthContext } from "../context/AuthContext";
import type { ContextType } from "react";

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
    render(
      <AuthContext
        value={
          { user: null, sessionStatus: "unknown" } as ContextType<
            typeof AuthContext
          >
        }
      >
        <OfflineIndicator />
      </AuthContext>,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Reconnect to verify your account",
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
      "Saved data is unavailable or has expired",
    );
  });
});
