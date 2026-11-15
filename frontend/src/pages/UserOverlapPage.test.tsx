import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
// apiMock must be imported BEFORE the page component.
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import "../i18n";
import * as AuthContextModule from "../context/AuthContext";
import { ApiError } from "../lib/api-error";
import type { OverlapResponse, OverlapTitle } from "../types";

const { default: UserOverlapPage } = await import("./UserOverlapPage");

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/u/me/overlap/bob"]}>
        <Routes>
          <Route
            path="/u/:username/overlap/:friendUsername"
            element={<UserOverlapPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function title(
  id: string,
  monetization_type: string,
  genres: string[],
): OverlapTitle {
  return {
    id,
    object_type: "MOVIE",
    title: `Title ${id}`,
    genres,
    offers: [
      {
        id: 1,
        title_id: id,
        provider_id: 8,
        monetization_type,
        presentation_type: "",
        price_value: null,
        price_currency: null,
        url: "https://example.com",
        available_to: null,
        provider_name: "Netflix",
        provider_technical_name: "netflix",
        provider_icon_url: "",
      },
    ],
    viewer_rating: null,
    friend_rating: null,
    is_tracked: true,
  } as unknown as OverlapTitle;
}

const response: OverlapResponse = {
  titles: [
    title("streamable", "FLATRATE", ["Drama"]),
    title("buy-only", "BUY", ["Comedy"]),
  ],
  sharedProviders: [
    { id: 8, name: "Netflix", technical_name: "netflix", icon_url: "" },
  ],
  counts: { intersection: 2, viewerOnly: 0, friendOnly: 0 },
  friendUser: { username: "bob", displayName: "Bob", image: null },
} as unknown as OverlapResponse;

let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  spies = [
    spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: {
        id: "u1",
        username: "me",
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
  ];
});

afterEach(() => {
  cleanup();
  resetApiMock();
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("UserOverlapPage", () => {
  it("'Watchable now' keeps FLATRATE titles on a shared service", async () => {
    // Regression: the filter compared against "flatrate" and matched nothing.
    apiMock.getOverlap.mockResolvedValue(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Title streamable")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Watchable now"));

    expect(screen.getByText("Title streamable")).toBeDefined();
    expect(screen.queryByText("Title buy-only")).toBeNull();
  });

  it("shows the genre filter when titles carry genres", async () => {
    apiMock.getOverlap.mockResolvedValue(response);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("By genre")).toBeDefined();
    });
  });

  it("retries once after a server error", async () => {
    let calls = 0;
    apiMock.getOverlap.mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new ApiError("Service unavailable", 503))
        : Promise.resolve(response);
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Title streamable")).toBeDefined();
    });
    expect(calls).toBe(2);
  });

  it("does not retry a 403", async () => {
    apiMock.getOverlap.mockImplementation(() =>
      Promise.reject(new ApiError("This user's watchlist is private", 403)),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Watchlist overlap unavailable.")).toBeDefined();
    });
    expect(apiMock.getOverlap).toHaveBeenCalledTimes(1);
  });
});
