import { describe, it, expect, spyOn, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PinnedFavoritesCard, { reorderPinned } from "./PinnedFavoritesCard";
import * as api from "../api";
import * as sonner from "sonner";
import type { PinnedTitle } from "../types";

function makePinned(n: number): PinnedTitle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    title: `Movie ${i + 1}`,
    poster_url: null,
    object_type: "MOVIE" as const,
    position: i,
  }));
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "unpinTitle").mockResolvedValue({ pinned: false }),
    spyOn(api, "reorderPinnedTitles").mockResolvedValue({ ok: true }),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

// ─── Pure helper unit tests ────────────────────────────────────────────────

describe("reorderPinned", () => {
  it("moves an item right (forward)", () => {
    const items = makePinned(3);
    const result = reorderPinned(items, "1", "3");
    expect(result.map((t) => t.id)).toEqual(["2", "3", "1"]);
    expect(result[0].position).toBe(0);
    expect(result[2].position).toBe(2);
  });

  it("moves an item left (backward)", () => {
    const items = makePinned(3);
    const result = reorderPinned(items, "3", "1");
    expect(result.map((t) => t.id)).toEqual(["3", "1", "2"]);
  });

  it("preserves order when swapping adjacent items", () => {
    const items = makePinned(4);
    const result = reorderPinned(items, "2", "3");
    expect(result.map((t) => t.id)).toEqual(["1", "3", "2", "4"]);
  });

  it("renumbers positions after reorder", () => {
    const items = makePinned(3);
    const result = reorderPinned(items, "3", "1");
    expect(result.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it("returns same reference when fromId is not found", () => {
    const items = makePinned(3);
    const result = reorderPinned(items, "99", "1");
    expect(result).toBe(items);
  });

  it("returns same reference when toId is not found", () => {
    const items = makePinned(3);
    const result = reorderPinned(items, "1", "99");
    expect(result).toBe(items);
  });
});

// ─── Component tests ────────────────────────────────────────────────────────

describe("PinnedFavoritesCard", () => {
  it("renders nothing for non-owner with empty pinned list", () => {
    const { container } = render(
      <PinnedFavoritesCard pinned={[]} isOwnProfile={false} />,
      { wrapper: Wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows placeholder for owner with empty pinned list", () => {
    render(<PinnedFavoritesCard pinned={[]} isOwnProfile={true} />, { wrapper: Wrapper });
    expect(screen.getByText(/pin your favorite titles/i)).toBeDefined();
  });

  it("does not show Edit button for non-owners", () => {
    const pinned = makePinned(2);
    render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={false} />, { wrapper: Wrapper });
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  it("shows Edit button for owner when pinned list is non-empty", () => {
    const pinned = makePinned(2);
    render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined();
  });

  it("toggles to Done when Edit is clicked", () => {
    const pinned = makePinned(2);
    render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /done/i })).toBeDefined();
  });

  it("shows unpin buttons in edit mode", () => {
    const pinned = makePinned(2);
    render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const unpinButtons = screen.getAllByTitle("Unpin");
    expect(unpinButtons.length).toBe(2);
  });

  describe("unpin", () => {
    it("calls api.unpinTitle and notifies parent on success", async () => {
      const pinned = makePinned(3);
      const onChanged = mock(() => {});
      render(
        <PinnedFavoritesCard pinned={pinned} isOwnProfile={true} onPinnedChanged={onChanged} />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const unpinButtons = screen.getAllByTitle("Unpin");
      fireEvent.click(unpinButtons[0]);

      await waitFor(() => {
        expect(api.unpinTitle).toHaveBeenCalledWith("1");
      });

      expect(onChanged).toHaveBeenCalledTimes(1);
      const [nextArg] = (onChanged as any).mock.calls[0] as [PinnedTitle[]];
      expect(nextArg.map((t: PinnedTitle) => t.id)).toEqual(["2", "3"]);
      expect(nextArg[0].position).toBe(0);
      expect(nextArg[1].position).toBe(1);
    });

    it("stays in edit mode after unpin (no page-flash)", async () => {
      const pinned = makePinned(3);
      render(
        <PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const unpinButtons = screen.getAllByTitle("Unpin");
      fireEvent.click(unpinButtons[0]);

      await waitFor(() => {
        expect(api.unpinTitle).toHaveBeenCalled();
      });

      expect(screen.getByRole("button", { name: /done/i })).toBeDefined();
    });

    it("shows error toast and does not notify parent when api fails", async () => {
      (api.unpinTitle as any).mockRejectedValueOnce(new Error("Network error"));
      const onChanged = mock(() => {});
      const pinned = makePinned(2);
      render(
        <PinnedFavoritesCard pinned={pinned} isOwnProfile={true} onPinnedChanged={onChanged} />,
        { wrapper: Wrapper },
      );

      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      fireEvent.click(screen.getAllByTitle("Unpin")[0]);

      await waitFor(() => {
        expect(sonner.toast.error).toHaveBeenCalledWith("Network error");
      });

      expect(onChanged).not.toHaveBeenCalled();
    });

    it("shows success toast on successful unpin", async () => {
      const pinned = makePinned(2);
      render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      fireEvent.click(screen.getAllByTitle("Unpin")[0]);

      await waitFor(() => {
        expect(sonner.toast.success).toHaveBeenCalledWith("Removed from pinned favorites");
      });
    });
  });

  describe("display", () => {
    it("shows at most 4 items in non-edit mode", () => {
      const pinned = makePinned(6);
      render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={false} />, { wrapper: Wrapper });
      const items = screen.getAllByText(/Movie \d/);
      expect(items.length).toBe(4);
    });

    it("shows all items (up to 8) in edit mode", () => {
      const pinned = makePinned(6);
      render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      const items = screen.getAllByText(/Movie \d/);
      expect(items.length).toBe(6);
    });

    it("shows empty-slot placeholders for owner with fewer than 4 pins", () => {
      const pinned = makePinned(2);
      render(<PinnedFavoritesCard pinned={pinned} isOwnProfile={true} />, { wrapper: Wrapper });
      const plusSlots = screen.getAllByText("+");
      expect(plusSlots.length).toBe(2);
    });
  });
});
