import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

// Initialize i18n before anything else
import "../i18n";

// Mock auth context
mock.module("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "testuser", display_name: null, auth_provider: "local", is_admin: false },
    providers: { local: true, oidc: null },
    loading: false,
    login: mock(() => Promise.resolve()),
    signup: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    refresh: mock(() => Promise.resolve()),
  }),
  AuthContext: {
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

const mockGetTrackedTitles = mock(() =>
  Promise.resolve({ titles: [], count: 0, profile_public: false })
);
const mockBulkTrackAction = mock(() => Promise.resolve({ updated: 0 }));

mock.module("../api", () => ({
  getTrackedTitles: mockGetTrackedTitles,
  trackTitle: mock(() => Promise.resolve()),
  untrackTitle: mock(() => Promise.resolve()),
  bulkTrackAction: mockBulkTrackAction,
}));

const { default: TrackedPage } = await import("./TrackedPage");

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  mockGetTrackedTitles.mockReset();
  mockBulkTrackAction.mockReset();
});

function makeShow(id: string, status: string | null, overrides = {}) {
  return {
    id,
    object_type: "SHOW",
    title: `Show ${id}`,
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-01",
    runtime_minutes: null,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    show_status: status,
    tracked_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMovie(id: string) {
  return {
    id,
    object_type: "MOVIE",
    title: `Movie ${id}`,
    original_title: null,
    release_year: 2024,
    release_date: "2024-01-01",
    runtime_minutes: 120,
    short_description: null,
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: null,
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: true,
    offers: [],
    tracked_at: "2024-01-01T00:00:00Z",
  };
}

describe("TrackedPage", () => {
  it("shows loading state initially", () => {
    mockGetTrackedTitles.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<TrackedPage />, { wrapper: Wrapper });
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });

  it("shows empty message when no tracked titles", async () => {
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles: [], count: 0, profile_public: false })
    );
    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByText(/No tracked titles yet/)).toBeDefined()
    );
  });

  it("groups shows by status with section headers", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeShow("s2", "caught_up"),
      makeShow("s3", "not_started"),
      makeShow("s4", "completed"),
      makeMovie("m1"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // Default view is list; switch to grid to see section headers
    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
      expect(screen.getByText("Caught Up (1)")).toBeDefined();
      expect(screen.getByText("Not Started (1)")).toBeDefined();
      expect(screen.getByText("Completed (1)")).toBeDefined();
      expect(screen.getByText("Movies (1)")).toBeDefined();
    });
  });

  it("does not render empty groups", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeMovie("m1"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
    });

    // These section headers (h3) should not exist — note that status filter tab buttons
    // like "Completed" and "Watching" are always rendered but as tab buttons, not group headers.
    // Group headers use the pattern "Label (count)" so we check for those specific patterns.
    expect(screen.queryByText("Caught Up (0)")).toBeNull();
    expect(screen.queryByText(/^Caught Up \(/)).toBeNull();
    expect(screen.queryByText("Not Started (0)")).toBeNull();
    expect(screen.queryByText(/^Not Started \(/)).toBeNull();
    expect(screen.queryByText("Unreleased (0)")).toBeNull();
    expect(screen.queryByText(/^Unreleased \(/)).toBeNull();
    expect(screen.queryByText("Completed (0)")).toBeNull();
    expect(screen.queryByText(/^Completed \(/)).toBeNull();
  });

  it("shows movies in their own section after shows", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeMovie("m1"),
      makeMovie("m2"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Movies (2)")).toBeDefined();
    });
  });

  it("shows total count in header", async () => {
    const titles = [
      makeShow("s1", "watching"),
      makeShow("s2", "completed"),
      makeMovie("m1"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // The new header uses a PageHeader kicker showing "Your library · N title(s)"
    await waitFor(() => {
      expect(screen.getByText("Your library · 3 titles")).toBeDefined();
    });
  });

  it("renders unreleased section when shows have unreleased status", async () => {
    const titles = [
      makeShow("s1", "unreleased"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Unreleased (1)")).toBeDefined();
    });
  });

  it("does not show movies section when there are no movies", async () => {
    const titles = [
      makeShow("s1", "watching"),
    ];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Grid")).toBeDefined());
    fireEvent.click(screen.getByText("Grid"));

    await waitFor(() => {
      expect(screen.getByText("Currently Watching (1)")).toBeDefined();
    });

    expect(screen.queryByText(/^Movies/)).toBeNull();
  });
});

describe("TrackedPage select mode", () => {
  it("shows Select toggle button", async () => {
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles: [makeMovie("m1"), makeMovie("m2")], count: 2, profile_public: false })
    );
    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());
  });

  it("enters select mode and shows the bulk action bar when a title is selected", async () => {
    const titles = [makeMovie("m1"), makeMovie("m2")];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });

    // Wait for data to load
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());

    // Click Select to enter select mode
    fireEvent.click(screen.getByText("Select"));

    // The "Select titles" helper message should appear (0 selected)
    await waitFor(() =>
      expect(screen.getByText("Select titles to apply bulk actions")).toBeDefined()
    );
  });

  it("exits select mode when Cancel is clicked", async () => {
    const titles = [makeMovie("m1")];
    mockGetTrackedTitles.mockImplementation(() =>
      Promise.resolve({ titles, count: titles.length, profile_public: false })
    );

    render(<TrackedPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("Select")).toBeDefined());

    fireEvent.click(screen.getByText("Select"));
    await waitFor(() =>
      expect(screen.getByText("Select titles to apply bulk actions")).toBeDefined()
    );

    // Click Cancel in the bar
    fireEvent.click(screen.getByText("Cancel"));

    // Bar should be gone
    await waitFor(() =>
      expect(screen.queryByText("Select titles to apply bulk actions")).toBeNull()
    );
  });
});
