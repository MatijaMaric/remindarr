import {
  describe,
  it,
  expect,
  mock,
  afterEach,
  beforeEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import NotificationPrompt from "./NotificationPrompt";
import { usePushSubscriptionSync } from "../hooks/usePushSubscriptionSync";
import * as push from "../lib/push";
import * as api from "../api";
import { AuthContext } from "../context/AuthContext";

const mockUser = {
  id: "1",
  username: "test",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
  signup: mock(() => Promise.resolve()),
};

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthContext value={mockAuthValue as any}>{children}</AuthContext>;
}

function WrapperNoUser({ children }: { children: ReactNode }) {
  return (
    <AuthContext value={{ ...mockAuthValue, user: null } as any}>
      {children}
    </AuthContext>
  );
}

const subscription = {
  endpoint: "https://example.com",
  p256dh: "key",
  auth: "auth",
};
const browserSubscription = {
  endpoint: subscription.endpoint,
  toJSON: () => ({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }),
} as PushSubscription;
const notifier = {
  id: "n1",
  provider: "webpush",
  enabled: true,
  config: subscription,
} as api.Notifier;
let spies: ReturnType<typeof spyOn>[] = [];

function mockNotificationPermission(value: NotificationPermission) {
  Object.defineProperty(globalThis, "Notification", {
    value: {
      permission: value,
      requestPermission: mock(() => Promise.resolve(value)),
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  mockNotificationPermission("default");
  spies = [
    spyOn(push, "isPushSupported").mockReturnValue(true),
    spyOn(push, "getExistingSubscription").mockResolvedValue(null),
    spyOn(push, "subscribeToPush").mockResolvedValue({
      endpoint: "https://example.com",
      p256dh: "key",
      auth: "auth",
    }),
    spyOn(api, "getNotifiers").mockResolvedValue({ notifiers: [] }),
    spyOn(api, "updateNotifier").mockResolvedValue({ notifier }),
    spyOn(api, "testNotifier").mockResolvedValue({
      success: true,
      message: "ok",
    }),
    spyOn(api, "getVapidPublicKey").mockResolvedValue({
      publicKey: "test-key",
    }),
    spyOn(api, "createNotifier").mockResolvedValue({
      notifier: { id: "n1" },
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("NotificationPrompt", () => {
  it("shows banner when push is supported, permission is default, no subscription, and user is authenticated", async () => {
    render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeDefined();
    });

    expect(
      screen.getByText(
        "Enable push notifications to get alerts about new episodes and releases.",
      ),
    ).toBeDefined();
  });

  it("does not show when user is not authenticated", async () => {
    const { container } = render(<NotificationPrompt />, {
      wrapper: WrapperNoUser,
    });

    // Wait a tick for the effect to run
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("does not show when push is not supported", async () => {
    (push.isPushSupported as any).mockReturnValue(false);

    const { container } = render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("does not show when permission and the browser delivery destination are registered", async () => {
    mockNotificationPermission("granted");
    (push.getExistingSubscription as any).mockResolvedValue(
      browserSubscription,
    );
    (api.getNotifiers as any).mockResolvedValue({ notifiers: [notifier] });

    const { container } = render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("does not show when permission is denied", async () => {
    mockNotificationPermission("denied");

    const { container } = render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("recovers granted permission with an unregistered browser subscription", async () => {
    mockNotificationPermission("granted");
    (push.getExistingSubscription as any).mockResolvedValue(
      browserSubscription,
    );
    render(<NotificationPrompt />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
    await waitFor(() =>
      expect(screen.queryByRole("banner") === null).toBe(true),
    );
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(push.subscribeToPush).not.toHaveBeenCalled();
    expect(api.getVapidPublicKey).not.toHaveBeenCalled();
    expect(api.createNotifier).toHaveBeenCalledTimes(1);
    expect(api.createNotifier).toHaveBeenCalledWith(
      expect.objectContaining({ config: subscription }),
    );
    expect(api.testNotifier).not.toHaveBeenCalled();
  });

  it("does not show when dismissed in localStorage", async () => {
    localStorage.setItem("notification-prompt-dismissed", "1");

    const { container } = render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("dismiss button sets localStorage and hides banner", async () => {
    render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText("Dismiss notification prompt"));

    expect(screen.queryByRole("banner") === null).toBe(true);
    expect(localStorage.getItem("notification-prompt-dismissed")).toBe("1");
  });

  it("enable button triggers push subscription flow", async () => {
    mockNotificationPermission("default");
    Object.defineProperty(globalThis, "Notification", {
      value: {
        permission: "default",
        requestPermission: mock(() => Promise.resolve("granted")),
      },
      writable: true,
      configurable: true,
    });

    render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Enable"));

    await waitFor(() => {
      expect(api.getVapidPublicKey).toHaveBeenCalled();
      expect(push.subscribeToPush).toHaveBeenCalledWith("test-key");
      expect(api.createNotifier).toHaveBeenCalled();
    });

    // Banner should be hidden after successful enable
    expect(screen.queryByRole("banner") === null).toBe(true);
  });

  it("hides banner when permission is denied during enable", async () => {
    Object.defineProperty(globalThis, "Notification", {
      value: {
        permission: "default",
        requestPermission: mock(() => Promise.resolve("denied")),
      },
      writable: true,
      configurable: true,
    });

    render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Enable"));

    await waitFor(() => {
      expect(screen.queryByRole("banner") === null).toBe(true);
    });
  });
});

it("recovers granted permission when the browser subscription is missing", async () => {
  mockNotificationPermission("granted");
  render(<NotificationPrompt />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await waitFor(() => expect(screen.queryByRole("banner") === null).toBe(true));
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect(push.subscribeToPush).toHaveBeenCalledTimes(1);
  expect(api.createNotifier).toHaveBeenCalledTimes(1);
});

it.each(["permission", "browser", "notifiers", "vapid", "subscribe", "create"])(
  "keeps %s setup failures visible and retryable",
  async (stage) => {
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: {
        permission: "default",
        requestPermission: mock(async () => {
          Object.defineProperty(Notification, "permission", {
            value: "granted",
            configurable: true,
          });
          return "granted";
        }),
      },
    });
    render(<NotificationPrompt />, { wrapper: Wrapper });
    const enable = await screen.findByRole("button", { name: "Enable" });
    const fail = new Error("Setup unavailable");
    if (stage === "permission")
      (Notification.requestPermission as any).mockRejectedValueOnce(fail);
    if (stage === "browser")
      (push.getExistingSubscription as any).mockRejectedValueOnce(fail);
    if (stage === "notifiers")
      (api.getNotifiers as any).mockRejectedValueOnce(fail);
    if (stage === "vapid")
      (api.getVapidPublicKey as any).mockRejectedValueOnce(fail);
    if (stage === "subscribe")
      (push.subscribeToPush as any).mockRejectedValueOnce(fail);
    if (stage === "create")
      (api.createNotifier as any).mockRejectedValueOnce(fail);
    fireEvent.click(enable);
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("banner")).toBeDefined();
    expect(localStorage.getItem("notification-prompt-dismissed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.queryByRole("banner") === null).toBe(true),
    );
    expect(api.createNotifier).toHaveBeenCalledTimes(
      stage === "create" ? 2 : 1,
    );
    expect(Notification.requestPermission).toHaveBeenCalledTimes(
      stage === "permission" ? 2 : 1,
    );
    expect(push.subscribeToPush).toHaveBeenCalledTimes(
      stage === "subscribe" ? 2 : 1,
    );
    expect(api.testNotifier).not.toHaveBeenCalled();
  },
);

it.each(["browser", "notifiers"])(
  "offers retry when initial %s registration lookup fails",
  async (stage) => {
    mockNotificationPermission("granted");
    if (stage === "browser")
      (push.getExistingSubscription as any).mockRejectedValueOnce(
        new Error("Offline"),
      );
    else (api.getNotifiers as any).mockRejectedValueOnce(new Error("Offline"));
    render(<NotificationPrompt />, { wrapper: Wrapper });
    expect(await screen.findByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.queryByRole("banner") === null).toBe(true),
    );
    expect(api.createNotifier).toHaveBeenCalledTimes(1);
  },
);

it("reconciles a successful create whose response was lost without duplicate destinations", async () => {
  mockNotificationPermission("granted");
  (api.createNotifier as any).mockImplementationOnce(async () => {
    (api.getNotifiers as any).mockResolvedValue({ notifiers: [notifier] });
    throw new Error("Response lost");
  });
  render(<NotificationPrompt />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("banner") === null).toBe(true));
  expect(api.createNotifier).toHaveBeenCalledTimes(1);
  expect(push.subscribeToPush).toHaveBeenCalledTimes(1);
  expect(api.updateNotifier).not.toHaveBeenCalled();
  expect(api.testNotifier).not.toHaveBeenCalled();
});

it("retries updating an incomplete matching notifier without creating another", async () => {
  mockNotificationPermission("granted");
  (push.getExistingSubscription as any).mockResolvedValue(browserSubscription);
  (api.getNotifiers as any).mockResolvedValue({
    notifiers: [
      {
        ...notifier,
        enabled: false,
        config: { endpoint: subscription.endpoint },
      },
    ],
  });
  (api.updateNotifier as any).mockRejectedValueOnce(new Error("Offline"));
  render(<NotificationPrompt />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("banner") === null).toBe(true));
  expect(api.updateNotifier).toHaveBeenCalledTimes(2);
  expect(api.updateNotifier).toHaveBeenLastCalledWith("n1", {
    config: subscription,
    enabled: true,
  });
  expect(api.createNotifier).not.toHaveBeenCalled();
  expect(push.subscribeToPush).not.toHaveBeenCalled();
});

it("does not count another browser's destination as registered or overwrite it", async () => {
  mockNotificationPermission("granted");
  (push.getExistingSubscription as any).mockResolvedValue(browserSubscription);
  (api.getNotifiers as any).mockResolvedValue({
    notifiers: [
      {
        ...notifier,
        config: { ...subscription, endpoint: "https://other.example.com" },
      },
    ],
  });
  render(<NotificationPrompt />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await waitFor(() => expect(screen.queryByRole("banner") === null).toBe(true));
  expect(api.createNotifier).toHaveBeenCalledTimes(1);
  expect(api.updateNotifier).not.toHaveBeenCalled();
});

it("prevents repeated activation while a registration request is pending", async () => {
  mockNotificationPermission("granted");
  let finish!: (value: { notifier: api.Notifier }) => void;
  (api.createNotifier as any).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<NotificationPrompt />, { wrapper: Wrapper });
  const enable = (await screen.findByRole("button", {
    name: "Enable",
  })) as HTMLButtonElement;
  fireEvent.click(enable);
  await waitFor(() => expect(api.createNotifier).toHaveBeenCalledTimes(1));
  expect(enable.disabled).toBe(true);
  fireEvent.click(enable);
  expect(api.createNotifier).toHaveBeenCalledTimes(1);
  finish({ notifier });
  await waitFor(() => expect(screen.queryByRole("banner") === null).toBe(true));
});

it("waits for automatic renewal and reconciles its destination before enabling", async () => {
  mockNotificationPermission("granted");
  let browser = browserSubscription;
  let serverNotifier = { ...notifier, enabled: false };
  let finishRenewal!: (value: typeof subscription) => void;
  const renewed = { ...subscription, endpoint: "https://example.com/renewed" };
  (push.getExistingSubscription as any).mockImplementation(async () => browser);
  (api.getNotifiers as any).mockImplementation(async () => ({
    notifiers: [serverNotifier],
  }));
  (push.subscribeToPush as any).mockImplementation(async () => {
    const result = await new Promise<typeof subscription>((resolve) => {
      finishRenewal = resolve;
    });
    browser = {
      endpoint: result.endpoint,
      toJSON: () => ({
        endpoint: result.endpoint,
        keys: { p256dh: result.p256dh, auth: result.auth },
      }),
    } as PushSubscription;
    return result;
  });
  (api.updateNotifier as any).mockImplementation(
    async (_id: string, data: api.NotifierPayload) => {
      serverNotifier = { ...serverNotifier, ...data };
      return { notifier: serverNotifier };
    },
  );
  const originalServiceWorker = Object.getOwnPropertyDescriptor(
    navigator,
    "serviceWorker",
  );
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
    },
  });
  function PromptWithSync() {
    usePushSubscriptionSync();
    return <NotificationPrompt />;
  }
  const view = render(<PromptWithSync />, { wrapper: Wrapper });
  try {
    await waitFor(() => expect(push.subscribeToPush).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
    expect(
      (screen.getByRole("button", { name: "Enabling..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(api.createNotifier).not.toHaveBeenCalled();
    expect(api.updateNotifier).not.toHaveBeenCalled();
    await act(async () => {
      finishRenewal(renewed);
    });
    await waitFor(() =>
      expect(screen.queryByRole("banner") === null).toBe(true),
    );
    expect(api.updateNotifier).toHaveBeenCalledTimes(1);
    expect(api.updateNotifier).toHaveBeenCalledWith("n1", {
      config: renewed,
      enabled: true,
    });
    expect(api.createNotifier).not.toHaveBeenCalled();
    expect(push.subscribeToPush).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    if (originalServiceWorker)
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    else Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

it("does not register a pending setup after unmounting", async () => {
  mockNotificationPermission("granted");
  let finish!: (value: typeof subscription) => void;
  (push.subscribeToPush as any).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<NotificationPrompt />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
  await waitFor(() => expect(push.subscribeToPush).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => {
    finish(subscription);
  });
  expect(api.createNotifier).not.toHaveBeenCalled();
  expect(api.updateNotifier).not.toHaveBeenCalled();
});
