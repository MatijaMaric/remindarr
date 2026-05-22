import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
