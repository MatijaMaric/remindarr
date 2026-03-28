import { describe, it, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ShareButton from "./ShareButton";
import * as sonner from "sonner";

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
  // Restore navigator.share if it was modified
  if ("share" in navigator) {
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });
  }
});

describe("ShareButton", () => {
  it("renders with Share text and icon", () => {
    render(<ShareButton />);
    const button = screen.getByRole("button", { name: /share/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain("Share");
  });

  it("has correct styling classes", () => {
    render(<ShareButton />);
    const button = screen.getByRole("button", { name: /share/i });
    expect(button.className).toContain("bg-zinc-800");
    expect(button.className).toContain("text-zinc-400");
  });

  it("copies URL to clipboard when navigator.share is not available", async () => {
    // Ensure navigator.share is undefined
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });

    const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    spies.push(writeText);

    render(<ShareButton url="https://example.com/movie/123" />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.com/movie/123");
      expect(sonner.toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("falls back to window.location.href when no url prop provided", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });

    const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    spies.push(writeText);

    render(<ShareButton />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
    });
  });

  it("shows error toast when clipboard write fails", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, writable: true, configurable: true });

    const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard failed"));
    spies.push(writeText);

    render(<ShareButton url="https://example.com/test" />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to copy link");
    });
  });

  it("uses navigator.share when available", async () => {
    const shareFn = spyOn(navigator, "share" as any).mockResolvedValue(undefined);
    // Ensure share is defined as a function
    Object.defineProperty(navigator, "share", { value: shareFn, writable: true, configurable: true });
    spies.push(shareFn);

    render(<ShareButton title="Test Movie" text="Check this out" url="https://example.com/movie/1" />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(shareFn).toHaveBeenCalledWith({
        title: "Test Movie",
        text: "Check this out",
        url: "https://example.com/movie/1",
      });
    });
  });

  it("silently handles user cancelling the share dialog", async () => {
    const abortError = new DOMException("Share canceled", "AbortError");
    const shareFn = () => Promise.reject(abortError);
    Object.defineProperty(navigator, "share", { value: shareFn, writable: true, configurable: true });

    render(<ShareButton url="https://example.com/test" />);

    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    // Should not show any toast on abort
    await waitFor(() => {
      expect(sonner.toast.success).not.toHaveBeenCalled();
      expect(sonner.toast.error).not.toHaveBeenCalled();
    });
  });
});
