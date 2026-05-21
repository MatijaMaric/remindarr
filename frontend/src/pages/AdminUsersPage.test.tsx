import { describe, test, expect, spyOn, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";
import type { AdminUsersResponse } from "../types";

// Initialize i18n so t() returns real strings
import "../i18n";

const { default: AdminUsersPage } = await import("./AdminUsersPage");

function newTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
let setAdminUserRoleSpy: ReturnType<typeof spyOn<typeof api, "setAdminUserRole">>;
let banAdminUserSpy: ReturnType<typeof spyOn<typeof api, "banAdminUser">>;
let unbanAdminUserSpy: ReturnType<typeof spyOn<typeof api, "unbanAdminUser">>;
let deleteAdminUserSpy: ReturnType<typeof spyOn<typeof api, "deleteAdminUser">>;

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: { id: "admin-1", username: "admin", display_name: "Admin", auth_provider: "local", is_admin: true },
    providers: { local: true, oidc: null },
    loading: false,
    sessionStatus: "authenticated",
    subscriptions: null,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  });
  getAdminUsersSpy = spyOn(api, "getAdminUsers");
  setAdminUserRoleSpy = spyOn(api, "setAdminUserRole");
  banAdminUserSpy = spyOn(api, "banAdminUser");
  unbanAdminUserSpy = spyOn(api, "unbanAdminUser");
  deleteAdminUserSpy = spyOn(api, "deleteAdminUser");
});

afterEach(() => {
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
    const el = document.querySelector(".text-zinc-500");
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

    await waitFor(() => {
      expect(setAdminUserRoleSpy).toHaveBeenCalledWith("u1", "admin");
    });
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

    // Modal should open — find the confirm button (button role, not heading)
    await waitFor(() => {
      expect(screen.getAllByText("Ban User").length).toBeGreaterThanOrEqual(1);
    });

    // Click the confirm button in the modal (the <button> with text "Ban User")
    const confirmButton = screen.getAllByRole("button", { name: "Ban User" })[0];
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

    // Confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Delete User")).toBeDefined();
    });

    // Click the confirm button
    const confirmButton = screen.getByText("Delete permanently");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteAdminUserSpy).toHaveBeenCalledWith("u1");
    });
  });
});
