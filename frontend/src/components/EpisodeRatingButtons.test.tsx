import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import EpisodeRatingButtons from "./EpisodeRatingButtons";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";
import type { EpisodeRatingResponse } from "../types";

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

const emptyResponse: EpisodeRatingResponse = {
  user_rating: null,
  user_review: null,
  aggregated: { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 },
  friends_ratings: [],
};

const ratedResponse: EpisodeRatingResponse = {
  user_rating: "LIKE",
  user_review: null,
  aggregated: { HATE: 1, DISLIKE: 0, LIKE: 3, LOVE: 2 },
  friends_ratings: [],
};

const friendsResponse: EpisodeRatingResponse = {
  user_rating: null,
  user_review: null,
  aggregated: { HATE: 0, DISLIKE: 1, LIKE: 2, LOVE: 1 },
  friends_ratings: [
    { user: { id: "u2", username: "alice" }, rating: "LIKE" },
    { user: { id: "u3", username: "bob" }, rating: "LOVE" },
  ],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getEpisodeRating").mockResolvedValue(emptyResponse),
    spyOn(api, "rateEpisode").mockResolvedValue(undefined),
    spyOn(api, "unrateEpisode").mockResolvedValue(undefined),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("EpisodeRatingButtons", () => {
  it("renders 4 rating buttons", async () => {
    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Hate" })).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Dislike" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
  });

  it("shows loading skeleton on mount", () => {
    (api.getEpisodeRating as any).mockImplementation(
      () => new Promise<EpisodeRatingResponse>(() => {})
    );

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    expect(screen.getByTestId("episode-rating-loading")).toBeDefined();
  });

  it("clicking a rating calls rateEpisode API", async () => {
    (api.getEpisodeRating as any)
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce({ ...emptyResponse, user_rating: "LIKE", aggregated: { ...emptyResponse.aggregated, LIKE: 1 } });

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(api.rateEpisode).toHaveBeenCalledWith(1, "LIKE", undefined);
    });

    expect(sonner.toast.success).toHaveBeenCalledWith("Rating saved");
  });

  it("clicking active rating calls unrateEpisode API", async () => {
    (api.getEpisodeRating as any)
      .mockResolvedValueOnce(ratedResponse)
      .mockResolvedValueOnce({ ...ratedResponse, user_rating: null, aggregated: { ...ratedResponse.aggregated, LIKE: 2 } });

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => {
      expect(api.unrateEpisode).toHaveBeenCalledWith(1);
    });

    expect(sonner.toast.success).toHaveBeenCalledWith("Rating removed");
  });

  it("shows review textarea after rating", async () => {
    (api.getEpisodeRating as any)
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce({ ...emptyResponse, user_rating: "LOVE", aggregated: { ...emptyResponse.aggregated, LOVE: 1 } });

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/short review/i)).toBeDefined();
    });
  });

  it("shows existing review on load", async () => {
    (api.getEpisodeRating as any).mockResolvedValue({
      ...ratedResponse,
      user_review: "Loved this episode!",
    });

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/short review/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Loved this episode!");
    });
  });

  it("shows friends ratings summary", async () => {
    (api.getEpisodeRating as any).mockResolvedValue(friendsResponse);

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("episode-friends-ratings")).toBeDefined();
    });

    const text = screen.getByTestId("episode-friends-ratings").textContent;
    expect(text).toContain("alice liked");
    expect(text).toContain("bob loved");
  });

  it("buttons are disabled when not authenticated", async () => {
    const noUserAuth = { ...mockAuthValue, user: null };

    render(
      <AuthContext value={noUserAuth as any}>
        <EpisodeRatingButtons episodeId={1} />
      </AuthContext>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Like" })).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "Hate" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Like" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Love" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows error toast when rating fails", async () => {
    (api.rateEpisode as any).mockRejectedValueOnce(new Error("Network error"));

    render(<EpisodeRatingButtons episodeId={1} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Love" })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update rating");
    });
  });
});
