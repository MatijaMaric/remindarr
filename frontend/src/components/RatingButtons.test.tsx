import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import RatingButtons from "./RatingButtons";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";
import type { TitleRatingResponse } from "../types";

const mockUser = { id: "1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  signup: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>;
}

const emptyRatingResponse: TitleRatingResponse = {
  user_rating: null,
  aggregated: { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 },
  friends_ratings: [],
};

const ratedResponse: TitleRatingResponse = {
  user_rating: "LIKE",
  aggregated: { HATE: 1, DISLIKE: 0, LIKE: 3, LOVE: 2 },
  friends_ratings: [],
};

const friendsResponse: TitleRatingResponse = {
  user_rating: null,
  aggregated: { HATE: 0, DISLIKE: 1, LIKE: 2, LOVE: 1 },
  friends_ratings: [
    { user: { id: "u2", username: "alice" }, rating: "LIKE" },
    { user: { id: "u3", username: "bob" }, rating: "LOVE" },
  ],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getTitleRating").mockResolvedValue(emptyRatingResponse),
    spyOn(api, "rateTitle").mockResolvedValue(undefined),
    spyOn(api, "unrateTitle").mockResolvedValue(undefined),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("RatingButtons", () => {
  it("renders 4 rating buttons", async () => {
    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Hate" })).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Dislike" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
  });

  it("shows loading skeleton on mount", () => {
    // Make getTitleRating hang
    (api.getTitleRating as any).mockImplementation(
      () => new Promise<TitleRatingResponse>(() => {})
    );

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    expect(screen.getByTestId("rating-loading")).toBeDefined();
  });

  it("clicking a rating calls rateTitle API", async () => {
    // After rating, the refresh call returns the new state
    (api.getTitleRating as any)
      .mockResolvedValueOnce(emptyRatingResponse)
      .mockResolvedValueOnce({ ...emptyRatingResponse, user_rating: "LIKE", aggregated: { ...emptyRatingResponse.aggregated, LIKE: 1 } });

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(api.rateTitle).toHaveBeenCalledWith("title-1", "LIKE");
    });

    expect(sonner.toast.success).toHaveBeenCalledWith("Rating saved");
  });

  it("clicking active rating calls unrateTitle API", async () => {
    (api.getTitleRating as any)
      .mockResolvedValueOnce(ratedResponse)
      .mockResolvedValueOnce({ ...ratedResponse, user_rating: null, aggregated: { ...ratedResponse.aggregated, LIKE: 2 } });

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(api.unrateTitle).toHaveBeenCalledWith("title-1");
    });

    expect(sonner.toast.success).toHaveBeenCalledWith("Rating removed");
  });

  it("active rating button has aria-pressed=true", async () => {
    (api.getTitleRating as any).mockResolvedValue(ratedResponse);

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" }).getAttribute("aria-pressed")).toBe("true");
    });

    // Others should be false
    expect(screen.getByRole("button", { name: "Hate" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Dislike" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Love" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows aggregated counts when > 0", async () => {
    (api.getTitleRating as any).mockResolvedValue(ratedResponse);

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    // ratedResponse has HATE: 1, LIKE: 3, LOVE: 2 — those should be visible
    const hateBtn = screen.getByRole("button", { name: "Hate" });
    expect(hateBtn.textContent).toContain("1");

    const likeBtn = screen.getByRole("button", { name: "Like" });
    expect(likeBtn.textContent).toContain("3");

    const loveBtn = screen.getByRole("button", { name: "Love" });
    expect(loveBtn.textContent).toContain("2");
  });

  it("buttons are disabled during API call", async () => {
    let resolveRate: () => void;
    (api.rateTitle as any).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveRate = resolve; })
    );

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" }).hasAttribute("disabled")).toBe(true);
    });

    // All buttons should be disabled
    expect(screen.getByRole("button", { name: "Hate" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Dislike" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Love" }).hasAttribute("disabled")).toBe(true);

    resolveRate!();
  });

  it("shows error toast when rating fails", async () => {
    (api.rateTitle as any).mockRejectedValueOnce(new Error("Network error"));

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update rating");
    });
  });

  it("shows read-only buttons when not authenticated", async () => {
    const noUserAuth = { ...mockAuthValue, user: null };

    render(
      <AuthContext value={noUserAuth as any}>
        <RatingButtons titleId="title-1" />
      </AuthContext>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    // All buttons should be disabled
    expect(screen.getByRole("button", { name: "Hate" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Dislike" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Like" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Love" }).hasAttribute("disabled")).toBe(true);
  });

  it("displays friends' ratings summary", async () => {
    (api.getTitleRating as any).mockResolvedValue(friendsResponse);

    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("friends-ratings")).toBeDefined();
    });

    const friendsText = screen.getByTestId("friends-ratings").textContent;
    expect(friendsText).toContain("alice liked");
    expect(friendsText).toContain("bob loved");
  });

  it("does not show friends section when there are no friends' ratings", async () => {
    render(<RatingButtons titleId="title-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    expect(screen.queryByTestId("friends-ratings")).toBeNull();
  });

  it("fetches rating data on mount", async () => {
    render(<RatingButtons titleId="title-42" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(api.getTitleRating).toHaveBeenCalledWith("title-42");
    });
  });
});
