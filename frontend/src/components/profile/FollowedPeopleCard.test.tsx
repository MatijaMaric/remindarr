import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../../i18n";
import * as AuthContextModule from "../../context/AuthContext";
import FollowedPeopleCard from "./FollowedPeopleCard";

const people = [
  { id: 31, name: "Tom Hanks", profile_path: "/tom.jpg" },
  { id: 42, name: "Greta Gerwig", profile_path: null },
];

// Other test files replace ../context/AuthContext via mock.module, and Bun
// keeps that stub for every file that runs after them in the same process.
// Rendering <AuthContext value> would then render the stub object. Stubbing
// useAuth with a per-test spy works whichever module is live.
let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: { id: "u1", username: "alice" },
    providers: null,
    loading: false,
    login: mock(),
    logout: mock(),
    refresh: mock(),
  } as any);
});

afterEach(() => {
  cleanup();
  useAuthSpy.mockRestore();
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FollowedPeopleCard", () => {
  it("links each followed person to their page", () => {
    render(<FollowedPeopleCard people={people} isOwnProfile={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("People followed")).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Tom Hanks/ }).getAttribute("href"),
    ).toBe("/person/31");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers unfollow buttons on the owner's profile", () => {
    render(<FollowedPeopleCard people={people} isOwnProfile />, {
      wrapper: Wrapper,
    });
    expect(screen.getAllByRole("button", { name: "Following" })).toHaveLength(
      2,
    );
  });

  it("renders nothing when no one is followed", () => {
    const { container } = render(
      <FollowedPeopleCard people={[]} isOwnProfile />,
      { wrapper: Wrapper },
    );
    expect(container.innerHTML).toBe("");
  });
});
