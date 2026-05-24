import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./i18n";
import * as api from "./api";
import { AuthContext } from "./context/AuthContext";
import App from "./App";

// Silence push-subscription API calls made by usePushSubscriptionSync
let getNotifiersSpy: ReturnType<typeof spyOn>;

function newTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const mockUser = {
  id: "1",
  username: "testuser",
  display_name: null,
  auth_provider: "local",
  is_admin: false,
};

const noUserAuth = {
  user: null,
  providers: null,
  loading: false,
  login: mock(() => Promise.resolve()),
  logout: mock(() => Promise.resolve()),
  refresh: mock(() => Promise.resolve()),
};

const loggedInAuth = {
  ...noUserAuth,
  user: mockUser,
};

function renderApp(path: string, auth: typeof noUserAuth = noUserAuth) {
  return render(
    <QueryClientProvider client={newTestClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthContext value={auth as any}>
          <App />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getNotifiersSpy = spyOn(api, "getNotifiers").mockResolvedValue([] as never);
});

afterEach(() => {
  getNotifiersSpy.mockRestore();
  cleanup();
});

describe("App nav Sign In link", () => {
  it("shows Sign In link in the desktop nav when user is not logged in and not on /login", () => {
    renderApp("/");
    // The desktop nav should contain a link pointing to /login
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const signInLink = nav.querySelector("a[href='/login']");
    expect(signInLink).not.toBeNull();
  });

  it("hides Sign In link in the desktop nav when already on /login", () => {
    renderApp("/login");
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const signInLink = nav.querySelector("a[href='/login']");
    // The desktop nav Sign In link must not appear when location is /login
    expect(signInLink).toBeNull();
  });

  it("hides Sign In link in the desktop nav when user is logged in", () => {
    renderApp("/", loggedInAuth);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const signInLink = nav.querySelector("a[href='/login']");
    expect(signInLink).toBeNull();
  });
});
