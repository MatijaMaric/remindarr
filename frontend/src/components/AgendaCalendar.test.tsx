import { describe, test, expect, afterEach, mock } from "bun:test";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock i18n before anything
import "../i18n";

// Mock auth context
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "me", display_name: "Me", auth_provider: "local", is_admin: false },
    subscriptions: null,
    providers: null,
    loading: false,
    sessionStatus: "authenticated",
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

// Mock the api module — include all functions AgendaCalendar (and sub-components) may import
mock.module("../api", () => ({
  getCalendarTitles: mock(() => Promise.resolve({ titles: [], episodes: [] })),
  getCrowdedWeekSettings: mock(() =>
    Promise.resolve({ crowdedWeekThreshold: 5, crowdedWeekBadgeEnabled: 1 })
  ),
  watchEpisode: mock(() => Promise.resolve()),
  unwatchEpisode: mock(() => Promise.resolve()),
  watchEpisodesBulk: mock(() => Promise.resolve()),
  watchMovie: mock(() => Promise.resolve()),
  unwatchMovie: mock(() => Promise.resolve()),
  getSubscriptions: mock(() => Promise.resolve({ providerIds: [] })),
}));

const { default: AgendaCalendar } = await import("./AgendaCalendar");

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

afterEach(() => {
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
      { wrapper: Wrapper }
    );

    // Component renders something (even if just a loading state)
    expect(container).toBeDefined();
  });
});
