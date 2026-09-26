import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../i18n";
import * as api from "../api";
import * as sonner from "sonner";
import EpisodeThread from "./EpisodeThread";
import type { EpisodeComment, EpisodeCommentsResponse } from "../types";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const comment: EpisodeComment = {
  id: "c1",
  body: "That ending",
  visibility: "public",
  created_at: "2026-09-01 12:00:00",
  user: {
    id: "u1",
    username: "alice",
    display_name: "Alice",
    image: null,
  },
  reactions: [
    { emoji: "👍", count: 1, reacted: false },
    { emoji: "❤️", count: 0, reacted: false },
  ],
  can_delete: true,
};

const loaded: EpisodeCommentsResponse = {
  emojis: ["👍", "❤️"],
  comments: [comment],
};

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "getEpisodeComments").mockResolvedValue(loaded),
    spyOn(api, "postEpisodeComment").mockResolvedValue({ comment }),
    spyOn(api, "deleteEpisodeComment").mockResolvedValue(undefined),
    spyOn(api, "toggleEpisodeCommentReaction").mockResolvedValue({
      comment: {
        ...comment,
        reactions: [
          { emoji: "👍", count: 2, reacted: true },
          { emoji: "❤️", count: 0, reacted: false },
        ],
      },
    }),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as never),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  cleanup();
});

const base = {
  titleId: "show-1",
  seasonNumber: 1,
  episodeNumber: 2,
  signedIn: true,
  statusReady: true,
};

describe("EpisodeThread", () => {
  it("hides the thread until the episode is watched", () => {
    render(<EpisodeThread {...base} watched={false} />, { wrapper: Wrapper });
    expect(
      screen.getByText("Mark this episode as watched to join the discussion."),
    ).toBeDefined();
    expect(api.getEpisodeComments).not.toHaveBeenCalled();
  });

  it("asks signed-out viewers to sign in", () => {
    render(<EpisodeThread {...base} signedIn={false} watched={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText(/Sign in and mark this episode/)).toBeDefined();
    expect(api.getEpisodeComments).not.toHaveBeenCalled();
  });

  it("posts a comment and toggles a reaction", async () => {
    render(<EpisodeThread {...base} watched />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("That ending")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Same" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(api.postEpisodeComment).toHaveBeenCalled());
    expect(api.postEpisodeComment).toHaveBeenCalledWith(
      "show-1",
      1,
      2,
      "Same",
      "public",
    );

    fireEvent.click(screen.getByRole("button", { name: "React with 👍" }));
    await waitFor(() =>
      expect(api.toggleEpisodeCommentReaction).toHaveBeenCalledWith("c1", "👍"),
    );
    await waitFor(() => expect(screen.getByText("👍 2")).toBeDefined());
  });
});
