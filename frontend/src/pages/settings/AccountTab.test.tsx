import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import "../../i18n";
import * as api from "../../api";
import * as AuthContextModule from "../../context/AuthContext";

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

// Keep auth-client mock as mock.module — it's a complex external lib (better-auth)
// and cannot be easily spyOn'd
mock.module("../../lib/auth-client", () => ({
  authClient: {
    changePassword: mock(() => Promise.resolve({ error: null })),
    passkey: {
      listUserPasskeys: mock(() => Promise.resolve({ data: [] })),
      addPasskey: mock(() => Promise.resolve({ error: null })),
      deletePasskey: mock(() => Promise.resolve({ error: null })),
      updatePasskey: mock(() => Promise.resolve({ error: null })),
    },
  },
}));

const { default: AccountTab } = await import("./AccountTab");

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: {
        id: "u1",
        username: "testuser",
        display_name: null,
        auth_provider: "local",
        is_admin: false,
      },
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
    spyOn(api, "getMyProfile").mockResolvedValue({
      display_name: "Test User",
      bio: null,
      country_code: null,
    } as any),
    spyOn(api, "getTrackedTitles").mockResolvedValue({
      titles: [],
      count: 0,
      profile_public: false,
      profile_visibility: "private",
    } as any),
    spyOn(api, "getActivitySettings").mockResolvedValue({
      enabled: false,
      kind_visibility: {},
    } as any),
  ];
});

afterEach(() => {
  cleanup();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("AccountTab", () => {
  it("renders without crashing", async () => {
    const client = newTestClient();
    render(<AccountTab />, { wrapper: wrapper(client) });

    // The UserSection renders immediately from AuthContext data — username appears in multiple inputs
    await waitFor(() => {
      expect(screen.getAllByDisplayValue("testuser").length).toBeGreaterThan(0);
    });
  });

  it("renders profile visibility section after data loads", async () => {
    const client = newTestClient();
    render(<AccountTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByTestId("visibility-selector")).toBeDefined();
    });
  });

  it("renders activity stream section", async () => {
    const client = newTestClient();
    render(<AccountTab />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByText("Activity stream")).toBeDefined();
    });
  });
});
