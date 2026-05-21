import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import NotificationModePicker from "./NotificationModePicker";

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={newTestClient()}>{children}</QueryClientProvider>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "setNotificationMode").mockResolvedValue(undefined as any),
    spyOn(api, "setRemindOnRelease").mockResolvedValue({ success: true, scheduledFor: null } as any),
    spyOn(api, "setTitleSnooze").mockResolvedValue({ success: true } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("NotificationModePicker", () => {
  it("renders mode buttons", () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" />,
      { wrapper: Wrapper },
    );
    // 3 mode buttons + 1 snooze button = 4 total
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("marks 'all' mode as active when currentMode is 'all'", () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" />,
      { wrapper: Wrapper },
    );
    const allButton = screen.getByRole("button", { name: /all episodes/i });
    expect(allButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks 'none' mode as active when currentMode is 'none'", () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="none" />,
      { wrapper: Wrapper },
    );
    const noneButton = screen.getByRole("button", { name: /muted/i });
    expect(noneButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls api.setNotificationMode when a mode button is clicked", async () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" />,
      { wrapper: Wrapper },
    );

    const noneButton = screen.getByRole("button", { name: /muted/i });
    fireEvent.click(noneButton);

    await waitFor(() => {
      expect(api.setNotificationMode).toHaveBeenCalledWith("t-1", "none");
    });
  });

  it("toggles off current mode (sets to null) when clicking the active mode", async () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="none" />,
      { wrapper: Wrapper },
    );

    const noneButton = screen.getByRole("button", { name: /muted/i });
    fireEvent.click(noneButton);

    await waitFor(() => {
      expect(api.setNotificationMode).toHaveBeenCalledWith("t-1", null);
    });
  });

  it("calls onModeChange callback on success", async () => {
    let receivedMode: string | null | undefined = undefined;
    render(
      <NotificationModePicker
        titleId="t-1"
        currentMode="all"
        onModeChange={(m) => { receivedMode = m; }}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: /muted/i }));

    await waitFor(() => {
      expect(receivedMode).toBe("none");
    });
  });

  it("shows remind-on-release button when releaseDate is in the future", () => {
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" releaseDate={futureDate} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("button", { name: /remind on release day/i })).toBeTruthy();
  });

  it("does not show remind-on-release button when releaseDate is not provided", () => {
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByRole("button", { name: /remind on release day/i })).toBeNull();
  });

  it("calls api.setRemindOnRelease when remind button is clicked", async () => {
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    render(
      <NotificationModePicker titleId="t-1" currentMode="all" releaseDate={futureDate} remindOnRelease={false} />,
      { wrapper: Wrapper },
    );

    const remindBtn = screen.getByRole("button", { name: /remind on release day/i });
    fireEvent.click(remindBtn);

    await waitFor(() => {
      expect(api.setRemindOnRelease).toHaveBeenCalledWith("t-1", true);
    });
  });
});
