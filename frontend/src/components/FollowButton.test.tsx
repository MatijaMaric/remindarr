import { describe, it, expect, mock, afterEach, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import "../i18n";
import FollowButton from "./FollowButton";
import * as api from "../api";
import * as sonner from "sonner";
import { AuthContext } from "../context/AuthContext";

const mockUser = { id: "user-1", username: "test", display_name: null, auth_provider: "local", is_admin: false };

const mockAuthValue = {
  user: mockUser,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

function Wrapper({ children, authValue }: { children: ReactNode; authValue?: typeof mockAuthValue }) {
  return <AuthContext value={(authValue ?? mockAuthValue) as any}>{children}</AuthContext>;
}

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(api, "followUser").mockResolvedValue(undefined as any),
    spyOn(api, "unfollowUser").mockResolvedValue(undefined as any),
    spyOn(sonner.toast, "success").mockImplementation(() => "1" as any),
    spyOn(sonner.toast, "error").mockImplementation(() => "1" as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("FollowButton", () => {
  it("renders 'Follow' when not following", () => {
    render(<FollowButton userId="user-2" initialIsFollowing={false} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Follow" })).toBeDefined();
  });

  it("renders 'Following' when following", () => {
    render(<FollowButton userId="user-2" initialIsFollowing={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "Following" })).toBeDefined();
  });

  it("returns null when user is not logged in", () => {
    const noUserAuth = { ...mockAuthValue, user: null };
    const { container } = render(
      <AuthContext value={noUserAuth as any}>
        <FollowButton userId="user-2" initialIsFollowing={false} />
      </AuthContext>
    );
    expect(container.innerHTML).toBe("");
  });

  it("does not render on own profile", () => {
    const { container } = render(
      <FollowButton userId="user-1" initialIsFollowing={false} />,
      { wrapper: Wrapper },
    );
    expect(container.innerHTML).toBe("");
  });

  it("calls followUser and updates to 'Following' on click", async () => {
    const onToggle = mock(() => {});
    render(<FollowButton userId="user-2" initialIsFollowing={false} onToggle={onToggle} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Follow" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Following" })).toBeDefined();
    });

    expect(api.followUser).toHaveBeenCalledWith("user-2");
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("calls unfollowUser and updates to 'Follow' on click", async () => {
    const onToggle = mock(() => {});
    render(<FollowButton userId="user-2" initialIsFollowing={true} onToggle={onToggle} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Following" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Follow" })).toBeDefined();
    });

    expect(api.unfollowUser).toHaveBeenCalledWith("user-2");
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows 'Unfollow' on hover when following", () => {
    render(<FollowButton userId="user-2" initialIsFollowing={true} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Following" });
    fireEvent.mouseEnter(button);

    expect(screen.getByRole("button", { name: "Unfollow" })).toBeDefined();
  });

  it("reverts to 'Following' on mouse leave", () => {
    render(<FollowButton userId="user-2" initialIsFollowing={true} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Following" });
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("button", { name: "Unfollow" })).toBeDefined();

    fireEvent.mouseLeave(button);
    expect(screen.getByRole("button", { name: "Following" })).toBeDefined();
  });

  it("shows loading indicator during API call", async () => {
    let resolveFollow: () => void;
    (api.followUser as any).mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveFollow = resolve; })
    );

    render(<FollowButton userId="user-2" initialIsFollowing={false} />, { wrapper: Wrapper });

    const button = screen.getByRole("button", { name: "Follow" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "..." })).toBeDefined();
    });

    expect(screen.getByRole("button", { name: "..." }).hasAttribute("disabled")).toBe(true);

    resolveFollow!();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Following" })).toBeDefined();
    });
  });

  it("shows success toast when following", async () => {
    render(<FollowButton userId="user-2" initialIsFollowing={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Following");
    });
  });

  it("shows success toast when unfollowing", async () => {
    render(<FollowButton userId="user-2" initialIsFollowing={true} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Following" }));

    await waitFor(() => {
      expect(sonner.toast.success).toHaveBeenCalledWith("Unfollowed");
    });
  });

  it("shows error toast when follow fails", async () => {
    (api.followUser as any).mockRejectedValueOnce(new Error("Network error"));

    render(<FollowButton userId="user-2" initialIsFollowing={false} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update follow status");
    });
  });

  it("shows error toast when unfollow fails", async () => {
    (api.unfollowUser as any).mockRejectedValueOnce(new Error("Network error"));

    render(<FollowButton userId="user-2" initialIsFollowing={true} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Following" }));

    await waitFor(() => {
      expect(sonner.toast.error).toHaveBeenCalledWith("Failed to update follow status");
    });
  });
});
