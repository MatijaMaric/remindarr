import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import NotificationModePicker from "./NotificationModePicker";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      {children}
    </QueryClientProvider>
  );
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "setNotificationMode").mockResolvedValue(undefined as any),
    spyOn(api, "setRemindOnRelease").mockResolvedValue({
      success: true,
      scheduledFor: null,
    } as any),
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
    render(<NotificationModePicker titleId="t-1" currentMode="all" />, {
      wrapper: Wrapper,
    });
    // 3 mode buttons + 1 snooze button = 4 total
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("marks 'all' mode as active when currentMode is 'all'", () => {
    render(<NotificationModePicker titleId="t-1" currentMode="all" />, {
      wrapper: Wrapper,
    });
    const allButton = screen.getByRole("button", { name: /all episodes/i });
    expect(allButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks 'none' mode as active when currentMode is 'none'", () => {
    render(<NotificationModePicker titleId="t-1" currentMode="none" />, {
      wrapper: Wrapper,
    });
    const noneButton = screen.getByRole("button", { name: /muted/i });
    expect(noneButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls api.setNotificationMode when a mode button is clicked", async () => {
    render(<NotificationModePicker titleId="t-1" currentMode="all" />, {
      wrapper: Wrapper,
    });

    const noneButton = screen.getByRole("button", { name: /muted/i });
    fireEvent.click(noneButton);

    await waitFor(() => {
      expect(api.setNotificationMode).toHaveBeenCalledWith("t-1", "none");
    });
  });

  it("toggles off current mode (sets to null) when clicking the active mode", async () => {
    render(<NotificationModePicker titleId="t-1" currentMode="none" />, {
      wrapper: Wrapper,
    });

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
        onModeChange={(m) => {
          receivedMode = m;
        }}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: /muted/i }));

    await waitFor(() => {
      expect(receivedMode).toBe("none");
    });
  });

  it("shows remind-on-release button when releaseDate is in the future", () => {
    const futureDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    render(
      <NotificationModePicker
        titleId="t-1"
        currentMode="all"
        releaseDate={futureDate}
      />,
      { wrapper: Wrapper },
    );
    expect(
      screen.getByRole("button", { name: /remind on release day/i }),
    ).toBeTruthy();
  });

  it("does not show remind-on-release button when releaseDate is not provided", () => {
    render(<NotificationModePicker titleId="t-1" currentMode="all" />, {
      wrapper: Wrapper,
    });
    expect(
      screen.queryByRole("button", { name: /remind on release day/i }),
    ).toBeNull();
  });

  it("calls api.setRemindOnRelease when remind button is clicked", async () => {
    const futureDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    render(
      <NotificationModePicker
        titleId="t-1"
        currentMode="all"
        releaseDate={futureDate}
        remindOnRelease={false}
      />,
      { wrapper: Wrapper },
    );

    const remindBtn = screen.getByRole("button", {
      name: /remind on release day/i,
    });
    fireEvent.click(remindBtn);

    await waitFor(() => {
      expect(api.setRemindOnRelease).toHaveBeenCalledWith("t-1", true);
    });
  });
});

describe("NotificationModePicker refreshed server state", () => {
  it("updates same-title mode and reminder props and resets for another title", () => {
    const props = {
      titleId: "t-1",
      currentMode: "all" as const,
      remindOnRelease: false,
      releaseDate: "2099-01-01",
    };
    const { rerender } = render(<NotificationModePicker {...props} />, {
      wrapper: Wrapper,
    });
    rerender(
      <NotificationModePicker {...props} currentMode="none" remindOnRelease />,
    );
    expect(
      screen
        .getByRole("button", { name: /muted/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /remind on release day/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    rerender(<NotificationModePicker {...props} titleId="t-2" />);
    expect(
      screen
        .getByRole("button", { name: /all episodes/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /remind on release day/i })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("keeps an in-flight mode edit then adopts refreshed props when the mutation settles", async () => {
    let resolve!: () => void;
    spies[0].mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(
      <NotificationModePicker titleId="t-1" currentMode="all" />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: /muted/i }));
    await waitFor(() => expect(api.setNotificationMode).toHaveBeenCalled());
    rerender(
      <NotificationModePicker titleId="t-1" currentMode="premieres_only" />,
    );
    expect(
      screen
        .getByRole("button", { name: /muted/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    resolve();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /premieres only/i })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });

  it("keeps an in-flight reminder edit and accepts the latest props after a failed save", async () => {
    let reject!: (error: Error) => void;
    spies[1].mockImplementation(
      () =>
        new Promise<void>((_done, fail) => {
          reject = fail;
        }),
    );
    const props = {
      titleId: "t-1",
      currentMode: "all" as const,
      remindOnRelease: false,
      releaseDate: "2099-01-01",
    };
    const { rerender } = render(<NotificationModePicker {...props} />, {
      wrapper: Wrapper,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /remind on release day/i }),
    );
    await waitFor(() => expect(api.setRemindOnRelease).toHaveBeenCalled());
    rerender(<NotificationModePicker {...props} remindOnRelease />);
    expect(
      screen
        .getByRole("button", { name: /remind on release day/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    reject(new Error("save failed"));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: /remind on release day/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(
      screen
        .getByRole("button", { name: /remind on release day/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
