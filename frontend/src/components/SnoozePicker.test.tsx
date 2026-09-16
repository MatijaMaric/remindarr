import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { userEvent } from "storybook/test";
import "../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import SnoozePicker from "./SnoozePicker";

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

let mockSetTitleSnooze: ReturnType<typeof spyOn>;
let mockSetRemindOnRelease: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockSetTitleSnooze = spyOn(api, "setTitleSnooze").mockResolvedValue({
    success: true,
  } as never);
  mockSetRemindOnRelease = spyOn(api, "setRemindOnRelease").mockResolvedValue({
    success: true,
    scheduledFor: null,
  } as never);
});

afterEach(() => {
  cleanup();
  mockSetTitleSnooze.mockRestore();
  mockSetRemindOnRelease.mockRestore();
});

describe("SnoozePicker", () => {
  it("renders bell icon when not snoozed", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />, {
      wrapper: Wrapper,
    });
    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders bell-off icon and shows snoozed state when snoozed", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    render(<SnoozePicker titleId="movie-123" snoozeUntil={futureDate} />, {
      wrapper: Wrapper,
    });
    const btn = screen.getByRole("button", { name: /notifications snoozed/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("opens dropdown on click", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />, {
      wrapper: Wrapper,
    });
    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /snooze 1 day/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /snooze 1 week/i }),
    ).toBeTruthy();
  });

  it("calls setTitleSnooze with ~1 day from now when Snooze 1 day is clicked", async () => {
    const onSnoozed = () => {};
    render(
      <SnoozePicker
        titleId="movie-123"
        snoozeUntil={null}
        onSnoozed={onSnoozed}
      />,
      { wrapper: Wrapper },
    );

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    const oneDayOption = screen.getByRole("menuitem", {
      name: /snooze 1 day/i,
    });
    fireEvent.click(oneDayOption);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockSetTitleSnooze).toHaveBeenCalledTimes(1);
    const [titleId, until] = mockSetTitleSnooze.mock.calls[0] as [
      string,
      string | null,
    ];
    expect(titleId).toBe("movie-123");
    expect(until).not.toBeNull();

    const diff = new Date(until!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(80000000);
    expect(diff).toBeLessThan(90000000);
  });

  it("calls setTitleSnooze(id, null) when Clear snooze is clicked", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const onSnoozed = () => {};
    render(
      <SnoozePicker
        titleId="movie-123"
        snoozeUntil={futureDate}
        onSnoozed={onSnoozed}
      />,
      { wrapper: Wrapper },
    );

    const btn = screen.getByRole("button", { name: /notifications snoozed/i });
    fireEvent.click(btn);

    const clearOption = screen.getByRole("menuitem", { name: /clear snooze/i });
    fireEvent.click(clearOption);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockSetTitleSnooze).toHaveBeenCalledTimes(1);
    const [titleId, until] = mockSetTitleSnooze.mock.calls[0] as [
      string,
      string | null,
    ];
    expect(titleId).toBe("movie-123");
    expect(until).toBeNull();
  });

  it("shows 'Until release' option when releaseDate is provided", () => {
    const futureRelease = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    render(
      <SnoozePicker
        titleId="movie-123"
        snoozeUntil={null}
        releaseDate={futureRelease}
      />,
      { wrapper: Wrapper },
    );

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    expect(
      screen.getByRole("menuitem", { name: /until release/i }),
    ).toBeTruthy();
  });

  it("does not show 'Clear snooze' when not snoozed", () => {
    render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />, {
      wrapper: Wrapper,
    });

    const btn = screen.getByRole("button", { name: /snooze notifications/i });
    fireEvent.click(btn);

    const options = screen.queryAllByRole("menuitem");
    const clearOption = options.find((o) =>
      o.textContent?.toLowerCase().includes("clear"),
    );
    expect(clearOption).toBeUndefined();
  });
});

it("dismisses with Escape and selects a snooze duration by keyboard", async () => {
  const user = userEvent.setup();
  render(<SnoozePicker titleId="movie-123" snoozeUntil={null} />, {
    wrapper: Wrapper,
  });
  const trigger = screen.getByRole("button", { name: /snooze notifications/i });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("menu");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(document.activeElement).toBe(trigger);
  await user.keyboard(" ");
  await screen.findByRole("menu");
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(
    screen.getByRole("menuitem", { name: /snooze 1 week/i }),
  );
  await user.keyboard("{Enter}");
  await waitFor(() => expect(mockSetTitleSnooze).toHaveBeenCalledTimes(1));
  const until = mockSetTitleSnooze.mock.calls[0][1] as string;
  expect(new Date(until).getTime() - Date.now()).toBeGreaterThan(6 * 86400000);
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});
