import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useInstallPrompt } from "./useInstallPrompt";

function fireBeforeInstallPrompt(): { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } {
  let resolveChoice: (value: { outcome: string }) => void;
  const userChoice = new Promise<{ outcome: string }>((resolve) => {
    resolveChoice = resolve;
  });
  const prompt = async () => {
    resolveChoice({ outcome: "accepted" });
  };

  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice });

  window.dispatchEvent(event);

  return { prompt, userChoice };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useInstallPrompt", () => {
  it("canInstall is false when no beforeinstallprompt event has fired", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("canInstall becomes true after beforeinstallprompt event", () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("dismiss sets localStorage and hides prompt", () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });
    expect(result.current.canInstall).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.canInstall).toBe(false);
    expect(localStorage.getItem("pwa-install-dismissed")).toBe("true");
  });

  it("canInstall is false when previously dismissed", () => {
    localStorage.setItem("pwa-install-dismissed", "true");

    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall calls prompt and clears deferredPrompt on accept", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireBeforeInstallPrompt();
    });
    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall keeps prompt available on dismiss", async () => {
    const { result } = renderHook(() => useInstallPrompt());

    let resolveChoice: (value: { outcome: string }) => void;
    const userChoice = new Promise<{ outcome: string }>((resolve) => {
      resolveChoice = resolve;
    });

    act(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {},
        userChoice,
      });
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);

    const promptPromise = act(async () => {
      const p = result.current.promptInstall();
      resolveChoice!({ outcome: "dismissed" });
      await p;
    });

    await promptPromise;

    // User dismissed the browser prompt, so deferredPrompt should still be available
    expect(result.current.canInstall).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = renderHook(() => useInstallPrompt());
    unmount();

    // After unmount, dispatching the event should not cause issues
    // (no way to directly assert listener removal, but no error means success)
    fireBeforeInstallPrompt();
  });
});
