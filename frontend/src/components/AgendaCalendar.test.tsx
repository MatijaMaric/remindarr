import {
  describe,
  test,
  expect,
  afterEach,
  mock,
  beforeEach,
  spyOn,
} from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../api";
import * as AuthContextModule from "../context/AuthContext";

// Mock i18n before anything
import "../i18n";

const { default: AgendaCalendar } = await import("./AgendaCalendar");

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

let useAuthSpy: ReturnType<typeof spyOn<typeof AuthContextModule, "useAuth">>;
let apiSpies: ReturnType<typeof spyOn>[];

beforeEach(() => {
  useAuthSpy = spyOn(AuthContextModule, "useAuth").mockReturnValue({
    user: {
      id: "u1",
      username: "me",
      display_name: "Me",
      auth_provider: "local",
      is_admin: false,
    },
    providers: null,
    loading: false,
    sessionStatus: "authenticated",
    subscriptions: null,
    refreshSubscriptions: mock(() => Promise.resolve()),
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  });
  apiSpies = [
    spyOn(api, "getCalendarTitles").mockResolvedValue({
      titles: [],
      episodes: [],
    } as any),
    spyOn(api, "getCrowdedWeekSettings").mockResolvedValue({
      crowdedWeekThreshold: 5,
      crowdedWeekBadgeEnabled: 1,
    } as any),
    spyOn(api, "watchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "unwatchEpisode").mockResolvedValue(undefined as any),
    spyOn(api, "watchEpisodesBulk").mockResolvedValue(undefined as any),
    spyOn(api, "watchMovie").mockResolvedValue(undefined as any),
    spyOn(api, "unwatchMovie").mockResolvedValue(undefined as any),
    spyOn(api, "getSubscriptions").mockResolvedValue({
      providerIds: [],
    } as any),
  ];
});

afterEach(() => {
  useAuthSpy.mockRestore();
  apiSpies.forEach((s) => s.mockRestore());
  cleanup();
});

describe("AgendaCalendar", () => {
  test("renders without crashing with mocked api", async () => {
    const searchParams = new URLSearchParams();
    const setSearchParams = mock(() => {});

    const { container } = render(
      <AgendaCalendar
        searchParams={searchParams}
        setSearchParams={setSearchParams as any}
      />,
      { wrapper: Wrapper },
    );

    // Component renders something (even if just a loading state)
    expect(container).toBeDefined();
  });
});
