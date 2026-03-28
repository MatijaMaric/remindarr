import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import NotificationPrompt from "./NotificationPrompt";
import * as push from "../lib/push";
import * as api from "../api";
import { AuthContext } from "../context/AuthContext";

const mockUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

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
  return <AuthContext value={{ ...mockAuthValue, user: null } as any}>{children}</AuthContext>;
}

let spies: ReturnType<typeof spyOn>[] = [];

function mockNotificationPermission(value: NotificationPermission) {
  Object.defineProperty(globalThis, "Notification", {
    value: { permission: value, requestPermission: mock(() => Promise.resolve(value)) },
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
    spyOn(push, "subscribeToPush").mockResolvedValue({ endpoint: "https://example.com", p256dh: "key", auth: "auth" }),
    spyOn(api, "getVapidPublicKey").mockResolvedValue({ publicKey: "test-key" }),
    spyOn(api, "createNotifier").mockResolvedValue({ notifier: { id: "n1" } } as any),
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

    expect(screen.getByText("Enable push notifications to get alerts about new episodes and releases.")).toBeDefined();
  });

  it("does not show when user is not authenticated", async () => {
    const { container } = render(<NotificationPrompt />, { wrapper: WrapperNoUser });

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

  it("does not show when permission is already granted", async () => {
    mockNotificationPermission("granted");

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

  it("does not show when there is an existing subscription", async () => {
    (push.getExistingSubscription as any).mockResolvedValue({ endpoint: "https://example.com" });

    const { container } = render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
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

    expect(screen.queryByRole("banner")).toBeNull();
    expect(localStorage.getItem("notification-prompt-dismissed")).toBe("1");
  });

  it("enable button triggers push subscription flow", async () => {
    mockNotificationPermission("default");
    Object.defineProperty(globalThis, "Notification", {
      value: { permission: "default", requestPermission: mock(() => Promise.resolve("granted")) },
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
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("hides banner when permission is denied during enable", async () => {
    Object.defineProperty(globalThis, "Notification", {
      value: { permission: "default", requestPermission: mock(() => Promise.resolve("denied")) },
      writable: true,
      configurable: true,
    });

    render(<NotificationPrompt />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Enable"));

    await waitFor(() => {
      expect(screen.queryByRole("banner")).toBeNull();
    });
  });
});
