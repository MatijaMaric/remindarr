import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n";
import FriendsCard from "./FriendsCard";

afterEach(() => cleanup());

describe("FriendsCard", () => {
  it("links each friend to their /user/:username profile", () => {
    // Regression: links pointed at /u/:username, which has no route (404).
    render(
      <MemoryRouter>
        <FriendsCard
          friends={[
            {
              id: "u2",
              username: "bob",
              display_name: "Bob",
              image: null,
              since: "2026-01-01T00:00:00Z",
            },
          ]}
          totalFriends={1}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Bob/ }).getAttribute("href")).toBe(
      "/user/bob",
    );
    expect(screen.queryByText("See all")).toBeNull();
  });
});
