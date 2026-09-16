import { describe, it, expect, mock, afterEach } from "bun:test";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./i18n";
import { resetApiMock } from "./test-utils/apiMock";
import { AuthContext } from "./context/AuthContext";
import App from "./App";

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
  subscriptions: null,
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

afterEach(() => {
  cleanup();
  resetApiMock();
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

describe("App search trigger", () => {
  it("advertises title search and the supported cross-platform shortcut", () => {
    renderApp("/login");
    const trigger = screen.getByRole("button", { name: "Search titles…" });
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("/");
    expect(trigger.querySelector("span.font-mono")?.textContent?.trim()).toBe(
      "/",
    );
    expect(
      trigger.querySelector("span.font-mono")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("navigates to Browse and focuses search using the displayed shortcut", async () => {
    renderApp("/login");
    fireEvent.keyDown(window, { key: "/" });
    const input = await screen.findByRole("textbox", {
      name: "Search titles or paste IMDB link",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("focuses and selects existing search text on Browse", async () => {
    renderApp("/browse");
    const input = (await screen.findByRole("textbox", {
      name: "Search titles or paste IMDB link",
    })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Breaking Bad" } });
    screen.getByRole("button", { name: "Search titles…" }).focus();
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("leaves focused editing fields alone", async () => {
    renderApp("/login");
    const input = await screen.findByLabelText("Username");
    input.focus();
    fireEvent.keyDown(input, { key: "/" });
    expect(document.activeElement).toBe(input);
    expect(
      screen.queryByRole("textbox", {
        name: "Search titles or paste IMDB link",
      }),
    ).toBeNull();
  });
});
