import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
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

// Mock push support as unsupported so PushNotificationsSection is skipped in tests
mock.module("../../lib/push", () => ({
  isPushSupported: () => false,
  subscribeToPush: mock(() => Promise.resolve({})),
  unsubscribeFromPush: mock(() => Promise.resolve()),
  getExistingSubscription: mock(() => Promise.resolve(null)),
}));

const { default: NotificationsTab } = await import("./NotificationsTab");

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getNotifiers").mockResolvedValue({ notifiers: [] } as any),
    spyOn(api, "getNotifierProviders").mockResolvedValue({
      providers: ["discord"],
    } as any),
    spyOn(api, "getDepartureAlertSettings").mockResolvedValue({
      streamingDeparturesEnabled: true,
      departureAlertLeadDays: 7,
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("NotificationsTab", () => {
  it("renders without crashing and shows notifiers section", async () => {
    const client = newTestClient();
    render(<NotificationsTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Notifiers")).toBeDefined();
    });
  });

  it("shows departure alerts section", async () => {
    const client = newTestClient();
    render(<NotificationsTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Streaming departure alerts")).toBeDefined();
    });
  });

  it("shows empty notifiers message when no notifiers configured", async () => {
    const client = newTestClient();
    render(<NotificationsTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("No notifiers configured.")).toBeDefined();
    });
  });
});
