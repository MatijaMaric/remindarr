import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import OfflineIndicator from "./OfflineIndicator";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    get: () => value,
    configurable: true,
  });
}

function mockServiceWorkerController(ageMs: number | null) {
  const postMessageMock = mock((message: any, transferable: any[]) => {
    const port = transferable[0] as MessagePort;
    setTimeout(() => {
      port.postMessage({ ageMs });
    }, 0);
  });

  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller: { postMessage: postMessageMock } },
    configurable: true,
    writable: true,
  });

  return postMessageMock;
}

function clearServiceWorkerController() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { controller: null },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setOnline(true);
  clearServiceWorkerController();
});

afterEach(() => {
  cleanup();
  setOnline(true);
  clearServiceWorkerController();
});

describe("OfflineIndicator", () => {
  it("renders nothing when online", () => {
    const { container } = render(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows banner when initially offline", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/You're offline/)).toBeDefined();
  });

  it("shows available features when offline", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/Browsing, details & calendar available/)).toBeDefined();
    expect(screen.getByText(/Episode & watchlist changes will sync/)).toBeDefined();
  });

  it("shows banner when offline event fires", () => {
    render(<OfflineIndicator />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/You're offline/)).toBeDefined();
  });

  it("hides banner when online event fires after going offline", () => {
    setOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/You're offline/)).toBeDefined();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByText(/You're offline/)).toBeNull();
  });

  it("shows staleness info when offline and cache age is available", async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    mockServiceWorkerController(eightDaysMs);
    setOnline(false);

    render(<OfflineIndicator />);

    await waitFor(() => {
      expect(screen.getByText(/8d ago/)).toBeDefined();
    });
  });

  it("uses urgent color class when cache is older than 7 days", async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    mockServiceWorkerController(eightDaysMs);
    setOnline(false);

    const { container } = render(<OfflineIndicator />);

    await waitFor(() => {
      expect(screen.getByText(/8d ago/)).toBeDefined();
    });

    expect((container.firstChild as HTMLElement).className).toContain("bg-orange-500");
  });

  it("uses normal color class when cache is fresh (under 7 days)", async () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    mockServiceWorkerController(oneDayMs);
    setOnline(false);

    const { container } = render(<OfflineIndicator />);

    await waitFor(() => {
      expect(screen.getByText(/1d ago/)).toBeDefined();
    });

    expect((container.firstChild as HTMLElement).className).toContain("bg-yellow-500");
  });

  it("shows 'recently' when cache age is less than 1 hour", async () => {
    const thirtyMinMs = 30 * 60 * 1000;
    mockServiceWorkerController(thirtyMinMs);
    setOnline(false);

    render(<OfflineIndicator />);

    await waitFor(() => {
      expect(screen.getByText(/recently/)).toBeDefined();
    });
  });

  it("does not show staleness when service worker controller is absent", () => {
    clearServiceWorkerController();
    setOnline(false);

    render(<OfflineIndicator />);

    expect(screen.queryByText(/ago/)).toBeNull();
    expect(screen.queryByText(/recently/)).toBeNull();
  });
});
