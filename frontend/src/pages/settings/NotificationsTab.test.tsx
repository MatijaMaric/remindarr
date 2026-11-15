import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
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

// Push is unsupported by default so PushNotificationsSection is skipped;
// the push tests below switch it on.
let pushSupported = false;
mock.module("../../lib/push", () => ({
  isPushSupported: () => pushSupported,
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

describe("Push notifications card (#1415)", () => {
  const hadNotification = "Notification" in globalThis;
  beforeEach(() => {
    pushSupported = true;
    if (!hadNotification) {
      (globalThis as any).Notification = {
        permission: "default",
        requestPermission: () => Promise.resolve("default"),
      };
    }
  });
  afterEach(() => {
    pushSupported = false;
    if (!hadNotification) delete (globalThis as any).Notification;
  });

  it("keeps the notifier when push is on for another device", async () => {
    (api.getNotifiers as any).mockResolvedValue({
      notifiers: [
        { id: "wp1", provider: "webpush", enabled: true, config: {} },
      ],
    });
    const del = spyOn(api, "deleteNotifier").mockResolvedValue(
      undefined as any,
    );
    spies.push(del);

    render(<NotificationsTab />, { wrapper: wrapper(newTestClient()) });

    expect(
      await screen.findByText("Push notifications are on for another device"),
    ).toBeDefined();
    expect(del).not.toHaveBeenCalled();
  });
});

describe("Notifier form triggers (#1415)", () => {
  it("offers only triggers that a job reads", async () => {
    const create = spyOn(api, "createNotifier").mockResolvedValue({
      notifier: {},
    } as any);
    spies.push(create);
    render(<NotificationsTab />, { wrapper: wrapper(newTestClient()) });

    fireEvent.click(await screen.findByText("Add notifier"));
    expect(screen.queryByText("Leaving soon alerts")).toBeNull();
    expect(screen.queryByText("Friend activity alerts")).toBeNull();
    expect(screen.getByText("Streaming availability alerts")).toBeDefined();
    expect(screen.getByText("Achievement notifications")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(/discord\.com/), {
      target: { value: "https://discord.com/api/webhooks/1/x" },
    });
    fireEvent.submit(screen.getByText("Create notifier").closest("form")!);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("leaving_soon_alerts_enabled");
    expect(body).not.toHaveProperty("friend_activity_alerts_enabled");
  });
});
