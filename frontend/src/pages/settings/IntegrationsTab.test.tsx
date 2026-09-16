import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../../i18n";
import * as api from "../../api";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const { default: IntegrationsTab } = await import("./IntegrationsTab");

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getIntegrations").mockResolvedValue({
      integrations: [],
    } as any),
    spyOn(api, "getFeedToken").mockResolvedValue({ token: null } as any),
    spyOn(api, "getKioskToken").mockResolvedValue({ token: null } as any),
    spyOn(api, "getWatchlistShareToken").mockResolvedValue({
      token: null,
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("IntegrationsTab", () => {
  it("renders without crashing", async () => {
    const client = newTestClient();
    render(<IntegrationsTab />, { wrapper: wrapper(client) });

    // PlexSection returns null while loading, then renders Connect button
    await waitFor(() => {
      expect(screen.getByText("Connect Plex")).toBeDefined();
    });
  });

  it("shows feed generate button when no feed token", async () => {
    const client = newTestClient();
    render(<IntegrationsTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // "Generate Feed URL" is the translated text for feed.generate
      expect(screen.getByText("Generate Feed URL")).toBeDefined();
    });
  });

  it("shows watchlist section", async () => {
    const client = newTestClient();
    render(<IntegrationsTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // "Watchlist" is the translated text for profile.watchlist
      expect(screen.getByText("Watchlist")).toBeDefined();
    });
  });
});

describe("JSON watchlist import", () => {
  it("opens the chooser from a focusable button and retains focus on cancellation", () => {
    render(<IntegrationsTab />, { wrapper: wrapper(newTestClient()) });
    const button = screen.getByRole("button", { name: "Import" });
    const input = screen.getByLabelText("Import Watchlist") as HTMLInputElement;
    const click = spyOn(input, "click");
    spies.push(click);

    button.focus();
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent(input, new Event("cancel", { bubbles: true }));
    expect(document.activeElement).toBe(button);
  });

  it("announces failure, blocks reentry while importing and permits the same file again", async () => {
    let rejectImport!: (error: Error) => void;
    const importFile = spyOn(api, "importWatchlist")
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectImport = reject;
          }),
      )
      .mockResolvedValue({ imported: 1, skipped: 0 });
    spies.push(importFile);
    render(<IntegrationsTab />, { wrapper: wrapper(newTestClient()) });
    const button = screen.getByRole("button", { name: "Import" });
    const input = screen.getByLabelText("Import Watchlist") as HTMLInputElement;
    const click = spyOn(input, "click");
    spies.push(click);
    const file = new File(["{}"], "watchlist.json", {
      type: "application/json",
    });

    button.focus();
    fireEvent.change(input, { target: { files: [file] } });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(true);
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
    rejectImport(new Error("Import unavailable"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Import unavailable",
      ),
    );
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(button);

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1"),
    );
    expect(importFile).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(input.value).toBe("");
  });
});
