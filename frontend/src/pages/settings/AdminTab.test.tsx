import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
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
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

const { default: AdminTab } = await import("./AdminTab");

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getJobs").mockResolvedValue({
      crons: [],
      stats: {},
      recentJobs: [],
    } as any),
    spyOn(api, "getAdminSettings").mockResolvedValue({
      oidc_configured: false,
      oidc: {
        issuer_url: { source: "unset", value: "" },
        client_id: { source: "unset", value: "" },
        client_secret: { source: "unset", value: "" },
        redirect_uri: { source: "unset", value: "" },
      },
    } as any),
    spyOn(api, "getAdminConfig").mockResolvedValue({
      safe: [],
      secrets: [],
    } as any),
    spyOn(api, "getAdminLogs").mockResolvedValue({
      entries: [],
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("AdminTab", () => {
  it("renders without crashing", async () => {
    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Background jobs")).toBeDefined();
    });
  });

  it("shows empty jobs message when no crons configured", async () => {
    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("No scheduled jobs configured.")).toBeDefined();
    });
  });

  it("shows OIDC config section", async () => {
    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("OpenID Connect")).toBeDefined();
    });
  });

  it("shows maintenance section", async () => {
    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Maintenance")).toBeDefined();
    });
  });
});

describe("BackgroundJobsSection bootstrap freshness badge", () => {
  it("shows error pill when bootstrap.lastSeenAt is older than 30 minutes", async () => {
    const oldTimestamp = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    spies.forEach((s) => s.mockRestore());
    spies = [
      spyOn(api, "getJobs").mockResolvedValue({
        crons: [],
        stats: {},
        recentJobs: [],
        bootstrap: { lastSeenAt: oldTimestamp },
      } as any),
      spyOn(api, "getAdminSettings").mockResolvedValue({
        oidc_configured: false,
        oidc: {
          issuer_url: { source: "unset", value: "" },
          client_id: { source: "unset", value: "" },
          client_secret: { source: "unset", value: "" },
          redirect_uri: { source: "unset", value: "" },
        },
      } as any),
      spyOn(api, "getAdminConfig").mockResolvedValue({
        safe: [],
        secrets: [],
      } as any),
      spyOn(api, "getAdminLogs").mockResolvedValue({
        entries: [],
      } as any),
    ];

    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      // The error pill text includes "Bootstrap:" and "m ago" (35+ minutes)
      const pills = screen.getAllByText(/Bootstrap:/);
      expect(pills.length).toBeGreaterThan(0);
    });
  });

  it("shows ok pill when bootstrap.lastSeenAt is within 5 minutes", async () => {
    const recentTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    spies.forEach((s) => s.mockRestore());
    spies = [
      spyOn(api, "getJobs").mockResolvedValue({
        crons: [],
        stats: {},
        recentJobs: [],
        bootstrap: { lastSeenAt: recentTimestamp },
      } as any),
      spyOn(api, "getAdminSettings").mockResolvedValue({
        oidc_configured: false,
        oidc: {
          issuer_url: { source: "unset", value: "" },
          client_id: { source: "unset", value: "" },
          client_secret: { source: "unset", value: "" },
          redirect_uri: { source: "unset", value: "" },
        },
      } as any),
      spyOn(api, "getAdminConfig").mockResolvedValue({
        safe: [],
        secrets: [],
      } as any),
      spyOn(api, "getAdminLogs").mockResolvedValue({
        entries: [],
      } as any),
    ];

    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      const pills = screen.getAllByText(/Bootstrap: 3m ago/);
      expect(pills.length).toBeGreaterThan(0);
    });
  });

  it("shows Bootstrap: Never when lastSeenAt is null", async () => {
    spies.forEach((s) => s.mockRestore());
    spies = [
      spyOn(api, "getJobs").mockResolvedValue({
        crons: [],
        stats: {},
        recentJobs: [],
        bootstrap: { lastSeenAt: null },
      } as any),
      spyOn(api, "getAdminSettings").mockResolvedValue({
        oidc_configured: false,
        oidc: {
          issuer_url: { source: "unset", value: "" },
          client_id: { source: "unset", value: "" },
          client_secret: { source: "unset", value: "" },
          redirect_uri: { source: "unset", value: "" },
        },
      } as any),
      spyOn(api, "getAdminConfig").mockResolvedValue({
        safe: [],
        secrets: [],
      } as any),
      spyOn(api, "getAdminLogs").mockResolvedValue({
        entries: [],
      } as any),
    ];

    const client = newTestClient();
    render(<AdminTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Bootstrap: Never")).toBeDefined();
    });
  });
});
