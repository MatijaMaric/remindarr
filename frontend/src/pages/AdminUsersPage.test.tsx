import { describe, test, expect, spyOn, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import type { AdminUsersResponse } from "../types";

// Mock AuthContext as admin user
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
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
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

// Mock i18n
mock.module("../i18n", () => ({}));

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

let getAdminUsersSpy: ReturnType<typeof spyOn<typeof api, "getAdminUsers">>;

beforeEach(() => {
  getAdminUsersSpy = spyOn(api, "getAdminUsers");
});

afterEach(() => {
  getAdminUsersSpy.mockRestore();
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
});
