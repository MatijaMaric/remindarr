import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Mock FollowButton directly — it depends on AuthContext (via useAuth), and
// mock.module for AuthContext leaks across files on Bun/Linux CI (see memory:
// feedback_mock_module_leak). Swapping FollowButton with a stub sidesteps the
// issue entirely while preserving the test's intent (visibility based on
// isOwnProfile). The stub still renders a "Follow" button so we can assert
// it's present/absent.
mock.module("../FollowButton", () => ({
  __esModule: true,
  default: ({ userId }: { userId: string }) => (
    <button type="button" data-testid="follow-button" data-user-id={userId}>
      Follow
    </button>
  ),
}));

import "../../i18n";
import ProfileHero from "./ProfileHero";
import type { UserProfileUser, ProfileBackdrop } from "../../types";

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function makeUser(overrides: Partial<UserProfileUser> = {}): UserProfileUser {
  return {
    id: "user-1",
    username: "matija",
    display_name: "Matija",
    image: null,
    member_since: "2024-03-01T00:00:00Z",
    bio: null,
    ...overrides,
  };
}

const backdrops: ProfileBackdrop[] = [
  { id: "t1", title: "A", backdrop_url: "/a.jpg" },
  { id: "t2", title: "B", backdrop_url: "/b.jpg" },
];

afterEach(() => cleanup());

describe("ProfileHero", () => {
  it("renders the display name and username", () => {
    render(
      <ProfileHero
        user={makeUser()}
        backdrops={backdrops}
        followerCount={10}
        followingCount={5}
        isFollowing={false}
        isOwnProfile={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Matija");
    expect(screen.getByText("@matija")).toBeDefined();
  });

  it("renders follower/following counts in the glass pill", () => {
    render(
      <ProfileHero
        user={makeUser()}
        backdrops={backdrops}
        followerCount={128}
        followingCount={64}
        isFollowing={false}
        isOwnProfile={false}
      />,
      { wrapper: Wrapper },
    );
    const bar = screen.getByTestId("social-bar");
    expect(bar.textContent).toContain("128");
    expect(bar.textContent).toContain("64");
  });

  it("shows the Edit profile link only for own profile", () => {
    const { rerender } = render(
      <ProfileHero
        user={makeUser()}
        backdrops={backdrops}
        followerCount={0}
        followingCount={0}
        isFollowing={false}
        isOwnProfile={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByTestId("settings-link")).toBeNull();
    expect(screen.queryByTestId("share-link")).not.toBeNull();

    rerender(
      <ProfileHero
        user={makeUser()}
        backdrops={backdrops}
        followerCount={0}
        followingCount={0}
        isFollowing={false}
        isOwnProfile={true}
      />,
    );
    expect(screen.queryByTestId("settings-link")).not.toBeNull();
  });

  it("hides the Follow button on own profile", () => {
    render(
      <ProfileHero
        user={makeUser()}
        backdrops={backdrops}
        followerCount={0}
        followingCount={0}
        isFollowing={false}
        isOwnProfile={true}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByRole("button", { name: /Follow|Following/ })).toBeNull();
  });

  it("renders a filmstrip of up to 5 backdrops", () => {
    const five: ProfileBackdrop[] = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      title: `T${i}`,
      backdrop_url: `/t${i}.jpg`,
    }));
    const { container } = render(
      <ProfileHero
        user={makeUser()}
        backdrops={five}
        followerCount={0}
        followingCount={0}
        isFollowing={false}
        isOwnProfile={false}
      />,
      { wrapper: Wrapper },
    );
    expect(container.querySelectorAll("img").length).toBe(5);
  });

  it("falls back to a gradient when there are no backdrops", () => {
    render(
      <ProfileHero
        user={makeUser()}
        backdrops={[]}
        followerCount={0}
        followingCount={0}
        isFollowing={false}
        isOwnProfile={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("fallback-bg")).toBeDefined();
  });
});
