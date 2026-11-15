import {
  describe,
  test,
  expect,
  spyOn,
  afterEach,
  beforeEach,
  mock,
} from "bun:test";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";
import * as sonner from "sonner";
import type { AdminUsersResponse } from "../types";

// Initialize i18n so t() returns real strings
import "../i18n";

const { default: AdminUsersPage } = await import("./AdminUsersPage");

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

const mockUsersResponse: AdminUsersResponse = {
  users: [
    {
      id: "u1",
      username: "alice",
      name: "Alice Smith",
      email: "alice@example.com",
      role: "user",
      is_admin: 0,
      banned: false,
      banned_reason: null,
      auth_provider: "local",
      created_at: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "u2",
      username: "bob",
      name: "Bob Jones",
      email: "bob@example.com",
      role: "user",
      is_admin: 0,
      banned: false,
      banned_reason: null,
      auth_provider: "local",
      created_at: "2024-02-01T00:00:00.000Z",
    },
  ],
  total: 2,
  page: 1,
  total_pages: 1,
};

const mockBannedUsersResponse: AdminUsersResponse = {
  users: [
    {
      id: "u1",
      username: "alice",
      name: "Alice Smith",
      email: "alice@example.com",
      role: "user",
      is_admin: 0,
      banned: true,
      banned_reason: "spamming",
      auth_provider: "local",
      created_at: "2024-01-01T00:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  total_pages: 1,
};

let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;
let getAdminUsersSpy: ReturnType<typeof spyOn<typeof api, "getAdminUsers">>;
let setAdminUserRoleSpy: ReturnType<
  typeof spyOn<typeof api, "setAdminUserRole">
>;
let banAdminUserSpy: ReturnType<typeof spyOn<typeof api, "banAdminUser">>;
let unbanAdminUserSpy: ReturnType<typeof spyOn<typeof api, "unbanAdminUser">>;
let deleteAdminUserSpy: ReturnType<typeof spyOn<typeof api, "deleteAdminUser">>;
let toastSuccessSpy: ReturnType<typeof spyOn<typeof sonner.toast, "success">>;

const adminAuth = {
  user: {
    id: "admin-1",
    username: "admin",
    display_name: "Admin",
    auth_provider: "local",
    is_admin: true,
  },
  providers: { local: true, oidc: null },
  loading: false,
  sessionStatus: "authenticated" as const,
  subscriptions: null,
  refreshSubscriptions: mock(() => Promise.resolve()),
  login: mock(() => Promise.resolve()),
  signup: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

beforeEach(() => {
  toastSuccessSpy = spyOn(sonner.toast, "success").mockImplementation(
    () => "1" as any,
  );
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue(
    adminAuth as any,
  );
  getAdminUsersSpy = spyOn(api, "getAdminUsers");
  setAdminUserRoleSpy = spyOn(api, "setAdminUserRole");
  banAdminUserSpy = spyOn(api, "banAdminUser");
  unbanAdminUserSpy = spyOn(api, "unbanAdminUser");
  deleteAdminUserSpy = spyOn(api, "deleteAdminUser");
});

afterEach(() => {
  toastSuccessSpy.mockRestore();
  useAuthSpy.mockRestore();
  getAdminUsersSpy.mockRestore();
  setAdminUserRoleSpy.mockRestore();
  banAdminUserSpy.mockRestore();
  unbanAdminUserSpy.mockRestore();
  deleteAdminUserSpy.mockRestore();
  cleanup();
});

describe("AdminUsersPage", () => {
  test("renders loading state", () => {
    getAdminUsersSpy.mockImplementation(() => new Promise(() => {}));
    render(<AdminUsersPage />, { wrapper: Wrapper });
    // Loading text is present from i18n key admin.users.loading - check for loading element
    const el = document.querySelector(".text-muted-foreground");
    expect(el).not.toBeNull();
  });

  test("renders users on success", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
      expect(screen.getByText("bob")).toBeDefined();
    });
  });

  test("roleToggleMutation — clicking promote calls setAdminUserRole with admin", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    setAdminUserRoleSpy.mockResolvedValue({ message: "ok" });

    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
    });

    // The first non-self user (alice, u1) has a "Promote to admin" button
    const promoteButtons = screen.getAllByTitle("Promote to admin");
    fireEvent.click(promoteButtons[0]);

    // Nothing changes until the admin confirms in a dialog naming the user
    expect(await screen.findByText("Make alice an admin?")).toBeDefined();
    expect(setAdminUserRoleSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Promote to admin" }));

    await waitFor(() => {
      expect(setAdminUserRoleSpy).toHaveBeenCalledWith("u1", "admin");
    });
    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith("alice is now an admin");
    });
  });

  test("cancelling the promote dialog changes nothing", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    render(<AdminUsersPage />, { wrapper: Wrapper });

    fireEvent.click((await screen.findAllByTitle("Promote to admin"))[0]);
    await screen.findByText("Make alice an admin?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Make alice an admin?")).toBeNull();
    });
    expect(setAdminUserRoleSpy).not.toHaveBeenCalled();
  });

  test("roleToggleMutation — clicking demote calls setAdminUserRole with user", async () => {
    const adminUsersResponse: AdminUsersResponse = {
      ...mockUsersResponse,
      users: [
        {
          id: "u1",
          username: "alice",
          name: "Alice Smith",
          email: "alice@example.com",
          role: "admin",
          is_admin: 1,
          banned: false,
          banned_reason: null,
          auth_provider: "local",
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
    };
    getAdminUsersSpy.mockResolvedValue(adminUsersResponse);
    setAdminUserRoleSpy.mockResolvedValue({ message: "ok" });

    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
    });

    const demoteButton = screen.getByTitle("Demote to user");
    fireEvent.click(demoteButton);
    await screen.findByText("Remove admin rights from alice?");
    fireEvent.click(screen.getByRole("button", { name: "Demote to user" }));

    await waitFor(() => {
      expect(setAdminUserRoleSpy).toHaveBeenCalledWith("u1", "user");
    });
  });

  test("banMutation — clicking ban button opens modal and submitting calls banAdminUser", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    banAdminUserSpy.mockResolvedValue({ message: "ok" });

    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
    });

    // Click the "Ban user" button for alice
    const banButtons = screen.getAllByTitle("Ban user");
    fireEvent.click(banButtons[0]);

    // Modal should open and name the user
    expect(await screen.findByText("Ban alice")).toBeDefined();

    // Click the confirm button in the modal (the <button> with text "Ban User")
    const confirmButton = screen.getAllByRole("button", {
      name: "Ban User",
    })[0];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(banAdminUserSpy).toHaveBeenCalledWith("u1", undefined);
    });
  });

  test("unbanMutation — clicking unban calls unbanAdminUser", async () => {
    getAdminUsersSpy.mockResolvedValue(mockBannedUsersResponse);
    unbanAdminUserSpy.mockResolvedValue({ message: "ok" });

    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
    });

    const unbanButton = screen.getByTitle("Unban user");
    fireEvent.click(unbanButton);

    await waitFor(() => {
      expect(unbanAdminUserSpy).toHaveBeenCalledWith("u1");
    });
  });

  test("deleteMutation — clicking delete opens confirm modal and submitting calls deleteAdminUser", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    deleteAdminUserSpy.mockResolvedValue({ message: "ok" });

    render(<AdminUsersPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeDefined();
    });

    // Click the "Delete user" button for alice
    const deleteButtons = screen.getAllByTitle("Delete user");
    fireEvent.click(deleteButtons[0]);

    // Confirm dialog should appear and name the user
    expect(await screen.findByText("Delete alice")).toBeDefined();

    // Click the confirm button
    const confirmButton = screen.getByText("Delete permanently");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteAdminUserSpy).toHaveBeenCalledWith("u1");
    });
  });
});

describe("AdminUsersPage — #1414 cleanup", () => {
  test("shows the ban reason next to a banned user", async () => {
    getAdminUsersSpy.mockResolvedValue({
      ...mockBannedUsersResponse,
      users: mockBannedUsersResponse.users.map((u) => ({
        ...u,
        ban_reason: "spamming",
      })),
    });
    render(<AdminUsersPage />, { wrapper: Wrapper });

    expect(await screen.findByText("Reason: spamming")).toBeDefined();
    expect(screen.getAllByText("Banned").length).toBeGreaterThanOrEqual(1);
  });

  test("ban and unban use different icons and labels", async () => {
    getAdminUsersSpy.mockResolvedValue({
      ...mockUsersResponse,
      users: [
        mockUsersResponse.users[0],
        { ...mockBannedUsersResponse.users[0], id: "u3", username: "carol" },
      ],
    });
    render(<AdminUsersPage />, { wrapper: Wrapper });

    const ban = await screen.findByTitle("Ban user");
    const unban = screen.getByTitle("Unban user");
    expect(ban.innerHTML).not.toBe(unban.innerHTML);
    const promote = screen.getAllByTitle("Promote to admin")[0];
    expect(promote.innerHTML).not.toBe(ban.innerHTML);
  });

  test("Back to Settings opens the Admin tab", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    render(<AdminUsersPage />, { wrapper: Wrapper });

    const link = await screen.findByRole("link", { name: /Back to Settings/ });
    expect(link.getAttribute("href")).toBe("/settings?tab=admin");
  });

  test("does not request the user list for non-admins", async () => {
    useAuthSpy.mockReturnValue({
      ...adminAuth,
      user: { ...adminAuth.user, is_admin: false },
    });
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    render(<AdminUsersPage />, { wrapper: Wrapper });

    expect(await screen.findByText("Access denied")).toBeDefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(getAdminUsersSpy).not.toHaveBeenCalled();
  });

  test("search waits for a pause in typing before requesting", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    render(<AdminUsersPage />, { wrapper: Wrapper });
    await screen.findByText("alice");
    getAdminUsersSpy.mockClear();

    const input = screen.getByLabelText("Search by username or name...");
    for (const value of ["a", "al", "ali"]) {
      fireEvent.change(input, { target: { value } });
    }
    expect(getAdminUsersSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(getAdminUsersSpy).toHaveBeenCalledTimes(1);
    });
    expect(getAdminUsersSpy.mock.calls[0][0]).toMatchObject({ search: "ali" });
  });
});

describe("AdminUsersPage — reset password (#461)", () => {
  test("sets a new password for a local user", async () => {
    getAdminUsersSpy.mockResolvedValue(mockUsersResponse);
    const resetSpy = spyOn(api, "resetAdminUserPassword").mockResolvedValue({
      message: "ok",
    });
    try {
      render(<AdminUsersPage />, { wrapper: Wrapper });

      const buttons = await screen.findAllByTitle("Reset password");
      fireEvent.click(buttons[0]);

      const input = await screen.findByLabelText(
        "New password (at least 8 characters)",
      );
      fireEvent.change(input, { target: { value: "temporary-pass" } });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() =>
        expect(resetSpy).toHaveBeenCalledWith("u1", "temporary-pass"),
      );
    } finally {
      resetSpy.mockRestore();
    }
  });

  test("hides the action for SSO-only users", async () => {
    getAdminUsersSpy.mockResolvedValue({
      ...mockUsersResponse,
      users: mockUsersResponse.users.map((u) => ({
        ...u,
        auth_provider: "oidc",
      })),
    });
    render(<AdminUsersPage />, { wrapper: Wrapper });
    await screen.findByText("alice");
    expect(screen.queryAllByTitle("Reset password")).toHaveLength(0);
  });
});
